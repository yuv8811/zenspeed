import { useState, useEffect } from "react";
import { useLoaderData, useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  Activity,
  Search,
  Zap,
  Database,
  CheckCircle2,
  AlertTriangle,
  Play,
  TrendingUp,
  Globe,
} from "lucide-react";
import { authenticate } from "../shopify.server";
import { runDualPageSpeedAudit } from "../services/pagespeed.server";
import { connectDB } from "../db.server";
import Audit, { getStoreAuditModel } from "../models/audit.model";
import ScoreCard from "../components/ScoreCard";
import MetricItem from "../components/MetricItem";
import CruxCard from "../components/CruxCard";
import OpportunityCard from "../components/OpportunityCard";
import StatBox from "../components/StatBox";

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop || "";
  let defaultUrl = shop ? `https://${shop}` : "https://web.dev/";

  try {
    const shopRes = await admin.graphql(
      `#graphql
      query getShopDomain {
        shop {
          primaryDomain {
            url
          }
        }
      }`,
    );
    const shopJson = await shopRes.json();
    if (shopJson.data?.shop?.primaryDomain?.url) {
      defaultUrl = shopJson.data.shop.primaryDomain.url;
    }
  } catch (err) {
    console.warn("Could not fetch primary domain:", err.message);
  }

  // eslint-disable-next-line no-undef
  const hasApiKey = Boolean(process.env.PAGESPEED_INSIGHT_KEY);

  let recentAudits = [];
  let stats = {
    totalAudits: 0,
    latestPerf: null,
    latestSeo: null,
  };
  let comparison = null;

  try {
    await connectDB();
    const StoreAudit = getStoreAuditModel(shop);

    // Auto-migrate legacy audits if store collection is currently empty
    const currentCount = await StoreAudit.countDocuments();
    if (currentCount === 0) {
      const legacyDocs = await Audit.find({ shop }).lean();
      if (legacyDocs.length > 0) {
        await StoreAudit.insertMany(
          legacyDocs.map((doc) => {
            const clean = { ...doc };
            delete clean._id;
            return clean;
          }),
        );
      }
    }

    const docs = await StoreAudit.find({})
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();

    // Group audits so 1 audit run = 1 card
    const groupedRuns = [];
    const processedIds = new Set();

    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i];
      const docId = doc._id.toString();
      if (processedIds.has(docId)) continue;
      processedIds.add(docId);

      if (doc.strategy === "both" || (doc.mobile && doc.desktop)) {
        groupedRuns.push({
          id: docId,
          url: doc.url,
          createdAt: doc.createdAt,
          formattedDate: new Date(doc.createdAt).toLocaleString(),
          mobileSpeed:
            doc.mobile?.scores?.performance ?? doc.scores?.performance ?? null,
          mobileSeo: doc.mobile?.scores?.seo ?? doc.scores?.seo ?? null,
          desktopSpeed: doc.desktop?.scores?.performance ?? null,
          desktopSeo: doc.desktop?.scores?.seo ?? null,
        });
      } else {
        // Legacy pair grouping: find complementary partner within 15 seconds
        const partner = docs.find((other) => {
          const otherId = other._id.toString();
          if (otherId === docId) return false;
          if (processedIds.has(otherId)) return false;
          if (other.url !== doc.url) return false;
          const diffMs = Math.abs(
            new Date(doc.createdAt).getTime() - new Date(other.createdAt).getTime(),
          );
          return diffMs <= 15000 && other.strategy !== doc.strategy;
        });

        const isMobile = doc.strategy === "mobile";
        const mobileDoc = isMobile ? doc : partner;
        const desktopDoc = isMobile ? partner : doc;

        if (partner) {
          processedIds.add(partner._id.toString());
        }

        groupedRuns.push({
          id: docId,
          url: doc.url,
          createdAt: doc.createdAt,
          formattedDate: new Date(doc.createdAt).toLocaleString(),
          mobileSpeed: mobileDoc?.scores?.performance ?? null,
          mobileSeo: mobileDoc?.scores?.seo ?? null,
          desktopSpeed: desktopDoc?.scores?.performance ?? null,
          desktopSeo: desktopDoc?.scores?.seo ?? null,
        });
      }
    }

    recentAudits = groupedRuns.slice(0, 6);
    stats.totalAudits = groupedRuns.length;

    if (groupedRuns.length > 0) {
      stats.latestPerf = groupedRuns[0].mobileSpeed;
      stats.latestSeo = groupedRuns[0].mobileSeo;

      // Before & After comparison (earliest baseline vs latest audit)
      if (groupedRuns.length >= 2) {
        const earliest = groupedRuns[groupedRuns.length - 1];
        const latest = groupedRuns[0];

        const perfDelta =
          (latest.mobileSpeed ?? 0) - (earliest.mobileSpeed ?? 0);
        const seoDelta =
          (latest.mobileSeo ?? 0) - (earliest.mobileSeo ?? 0);

        comparison = {
          baselineDate: new Date(earliest.createdAt).toLocaleDateString(),
          latestDate: new Date(latest.createdAt).toLocaleDateString(),
          baselinePerf: earliest.mobileSpeed ?? 0,
          latestPerf: latest.mobileSpeed ?? 0,
          perfDelta,
          baselineSeo: earliest.mobileSeo ?? 0,
          latestSeo: latest.mobileSeo ?? 0,
          seoDelta,
          url: latest.url,
        };
      }
    }
  } catch (e) {
    console.warn("Could not load audit data from MongoDB:", e.message);
  }

  return {
    shop,
    defaultUrl,
    hasApiKey,
    recentAudits,
    stats,
    comparison,
  };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const url = formData.get("url") || "";

  try {
    const { mobile, desktop } = await runDualPageSpeedAudit({
      url: url.toString(),
    });

    // Save as a SINGLE dual audit record in the store's dedicated MongoDB collection
    try {
      await connectDB();
      const StoreAudit = getStoreAuditModel(session.shop);
      await StoreAudit.create({
        shop: session.shop,
        url: mobile.url,
        strategy: "both",
        scores: mobile.scores,
        lighthouseMetrics: mobile.lighthouseMetrics,
        cruxMetrics: mobile.cruxMetrics,
        speedOpportunities: mobile.speedOpportunities?.slice(0, 10),
        mobile: {
          scores: mobile.scores,
          lighthouseMetrics: mobile.lighthouseMetrics,
          cruxMetrics: mobile.cruxMetrics,
          speedOpportunities: mobile.speedOpportunities?.slice(0, 10),
          seoAudits: mobile.seoAudits,
        },
        desktop: {
          scores: desktop.scores,
          lighthouseMetrics: desktop.lighthouseMetrics,
          cruxMetrics: desktop.cruxMetrics,
          speedOpportunities: desktop.speedOpportunities?.slice(0, 10),
          seoAudits: desktop.seoAudits,
        },
      });
    } catch (dbError) {
      console.warn("Could not save audit to MongoDB:", dbError.message);
    }

    return {
      ok: true,
      mobileResults: mobile,
      desktopResults: desktop,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      mobileResults: null,
      desktopResults: null,
      error: error.message || "Failed to fetch PageSpeed data.",
    };
  }
};

export default function Index() {
  const { defaultUrl, hasApiKey, recentAudits, stats, comparison } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();

  const [targetUrl, setTargetUrl] = useState(defaultUrl);
  const [activeDevice, setActiveDevice] = useState("mobile"); // "mobile" | "desktop"

  const isLoading =
    ["loading", "submitting"].includes(fetcher.state) &&
    fetcher.formMethod === "POST";

  const mobileData = fetcher.data?.mobileResults;
  const desktopData = fetcher.data?.desktopResults;
  const auditData = activeDevice === "mobile" ? mobileData : desktopData;
  const auditError = fetcher.data?.error;

  useEffect(() => {
    if (fetcher.data?.ok && (mobileData || desktopData)) {
      shopify.toast?.show("Dual PageSpeed audit completed & saved to MongoDB!");
    } else if (fetcher.data?.error) {
      shopify.toast?.show("Audit failed. Check error details below.");
    }
  }, [fetcher.data, mobileData, desktopData, shopify]);

  const handleRunAudit = (overrideUrl) => {
    const urlToTest = (overrideUrl || targetUrl).trim();
    if (!urlToTest) return;

    fetcher.submit(
      { url: urlToTest },
      { method: "POST" },
    );
  };

  const handlePageSelect = (path) => {
    try {
      const base = new URL(defaultUrl);
      setTargetUrl(`${base.origin}${path}`);
    } catch {
      setTargetUrl(`${defaultUrl}${path}`);
    }
  };

  return (
    <s-page heading="ZenSpeed: Performance & SEO Hub">
      <s-button
        slot="primary-action"
        variant="primary"
        onClick={() => handleRunAudit(defaultUrl)}
        disabled={isLoading}
      >
        <Play size={14} style={{ marginRight: "4px" }} />
        {isLoading ? "Auditing Store..." : "Quick Audit"}
      </s-button>

      {/* Configuration Alert if API key is not detected */}
      {!hasApiKey && (
        <s-banner tone="warning" heading="PageSpeed API Key Not Detected">
          <s-paragraph>
            Please set <code>PAGESPEED_INSIGHT_KEY</code> in your <code>.env</code> file
            to avoid Google API rate limits.
          </s-paragraph>
        </s-banner>
      )}

      {/* Key Metric Overview Cards */}
      <s-section>
        <s-grid gridtemplatecolumns="repeat(auto-fit, minmax(220px, 1fr))" gap="base">
          <StatBox
            label="Latest Speed Score"
            value={stats.latestPerf !== null ? `${stats.latestPerf}/100` : "No Data"}
            subtext="Simulated mobile performance"
            icon={Zap}
            tone={
              stats.latestPerf >= 90
                ? "success"
                : stats.latestPerf >= 50
                  ? "warning"
                  : stats.latestPerf !== null
                    ? "critical"
                    : "neutral"
            }
          />
          <StatBox
            label="Latest SEO Score"
            value={stats.latestSeo !== null ? `${stats.latestSeo}/100` : "No Data"}
            subtext="Google search indexing factor"
            icon={Search}
            tone={
              stats.latestSeo >= 90
                ? "success"
                : stats.latestSeo >= 50
                  ? "warning"
                  : stats.latestSeo !== null
                    ? "critical"
                    : "neutral"
            }
          />
          <StatBox
            label="Saved Audit Runs"
            value={stats.totalAudits}
            subtext="Persisted in MongoDB"
            icon={Database}
            tone="info"
          />
          <StatBox
            label="Optimizer Status"
            value="Active"
            subtext="Theme App Extension ready"
            icon={Activity}
            tone="success"
          />
        </s-grid>
      </s-section>

      {/* Before vs. After Optimization Impact (PRD Section 6 MVP) */}
      {comparison && (
        <s-section heading="Optimization Impact: Before vs. After">
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-stack direction="block" gap="base">
              <s-stack direction="inline" justifycontent="space-between" alignitems="center">
                <s-stack direction="inline" gap="small-100" alignitems="center">
                  <TrendingUp size={20} color="#008060" />
                  <s-heading>Storefront Performance Gain</s-heading>
                </s-stack>
                <s-text tone="subdued">
                  Comparing baseline ({comparison.baselineDate}) to latest ({comparison.latestDate})
                </s-text>
              </s-stack>

              <s-grid gridtemplatecolumns="repeat(auto-fit, minmax(200px, 1fr))" gap="base">
                <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                  <s-stack direction="block" gap="none">
                    <s-text tone="subdued">PageSpeed Score Delta</s-text>
                    <s-heading>
                      {comparison.perfDelta >= 0 ? `+${comparison.perfDelta}` : comparison.perfDelta} pts
                    </s-heading>
                    <s-badge tone={comparison.perfDelta >= 0 ? "success" : "critical"}>
                      {comparison.baselinePerf} &rarr; {comparison.latestPerf}
                    </s-badge>
                  </s-stack>
                </s-box>

                <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                  <s-stack direction="block" gap="none">
                    <s-text tone="subdued">SEO Score Delta</s-text>
                    <s-heading>
                      {comparison.seoDelta >= 0 ? `+${comparison.seoDelta}` : comparison.seoDelta} pts
                    </s-heading>
                    <s-badge tone={comparison.seoDelta >= 0 ? "success" : "critical"}>
                      {comparison.baselineSeo} &rarr; {comparison.latestSeo}
                    </s-badge>
                  </s-stack>
                </s-box>

                <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                  <s-stack direction="block" gap="none">
                    <s-text tone="subdued">Audited URL</s-text>
                    <s-heading>{comparison.url}</s-heading>
                    <s-badge tone="info">Live Monitored</s-badge>
                  </s-stack>
                </s-box>
              </s-grid>
            </s-stack>
          </s-box>
        </s-section>
      )}

      {/* Audit Input Form Section */}
      <s-section heading="Run Live Storefront Audit">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Simultaneously audits both Mobile &amp; Desktop Core Web Vitals, Google Lighthouse metrics, and technical SEO factors in a single run.
          </s-paragraph>

          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-stack direction="block" gap="base">
              {/* Storefront URL Header & Direct Action */}
              <s-stack direction="inline" justifycontent="space-between" alignitems="center">
                <s-stack direction="inline" gap="base" alignitems="center">
                  <Globe size={22} color="#008060" />
                  <s-stack direction="block" gap="none">
                    <s-heading>{targetUrl}</s-heading>
                    <s-text tone="subdued">
                      Direct storefront audit &bull; Tests Mobile and Desktop concurrently
                    </s-text>
                  </s-stack>
                </s-stack>

                <s-button
                  variant="primary"
                  onClick={() => handleRunAudit()}
                  disabled={isLoading}
                >
                  <Play size={14} style={{ marginRight: "4px" }} />
                  {isLoading ? "Auditing Mobile & Desktop..." : "Run PageSpeed Audit"}
                </s-button>
              </s-stack>

              {/* Page Selection Buttons */}
              <s-stack direction="inline" gap="small-100" alignitems="center">
                <s-text tone="subdued">Audit Page:</s-text>
                <s-button
                  variant={targetUrl === defaultUrl ? "primary" : "tertiary"}
                  onClick={() => handlePageSelect("/")}
                >
                  Home Page
                </s-button>
                <s-button
                  variant={targetUrl.endsWith("/collections/all") ? "primary" : "tertiary"}
                  onClick={() => handlePageSelect("/collections/all")}
                >
                  All Products
                </s-button>
                <s-button
                  variant={targetUrl.endsWith("/cart") ? "primary" : "tertiary"}
                  onClick={() => handlePageSelect("/cart")}
                >
                  Cart Page
                </s-button>
              </s-stack>
            </s-stack>
          </s-box>

          {isLoading && (
            <s-banner tone="info" heading="Auditing storefront with Google Lighthouse...">
              <s-paragraph>
                Simultaneously measuring Mobile and Desktop Core Web Vitals, Largest Contentful Paint, Cumulative Layout Shift, and SEO factors for <strong>{targetUrl}</strong>. This test takes ~10–15 seconds.
              </s-paragraph>
            </s-banner>
          )}

          {auditError && (
            <s-banner tone="critical" heading="Audit Request Failed">
              <s-paragraph>{auditError}</s-paragraph>
            </s-banner>
          )}
        </s-stack>
      </s-section>

      {/* Audit Results View with Instant Mobile / Desktop Switcher */}
      {auditData && !isLoading && (
        <>
          {/* Lighthouse Category Scores */}
          <s-section heading="Lighthouse Category Scores">
            <s-stack direction="block" gap="base">
              <s-stack direction="inline" justifycontent="space-between" alignitems="center">
                <s-paragraph>
                  Audited URL: <s-link href={auditData.url} target="_blank">{auditData.url}</s-link>
                </s-paragraph>

                {/* Instant Device Switcher */}
                <s-stack direction="inline" gap="small-100" alignitems="center">
                  <s-button
                    variant={activeDevice === "mobile" ? "primary" : "tertiary"}
                    onClick={() => setActiveDevice("mobile")}
                  >
                    📱 Mobile View ({mobileData?.scores?.performance ?? "..."}/100)
                  </s-button>
                  <s-button
                    variant={activeDevice === "desktop" ? "primary" : "tertiary"}
                    onClick={() => setActiveDevice("desktop")}
                  >
                    💻 Desktop View ({desktopData?.scores?.performance ?? "..."}/100)
                  </s-button>
                </s-stack>
              </s-stack>

              <s-grid gridtemplatecolumns="repeat(auto-fit, minmax(180px, 1fr))" gap="base">
                <ScoreCard label="Performance" score={auditData.scores.performance} />
                <ScoreCard label="SEO" score={auditData.scores.seo} />
                {auditData.scores.accessibility !== null && (
                  <ScoreCard label="Accessibility" score={auditData.scores.accessibility} />
                )}
                {auditData.scores.bestPractices !== null && (
                  <ScoreCard label="Best Practices" score={auditData.scores.bestPractices} />
                )}
              </s-grid>
            </s-stack>
          </s-section>

          {/* Core Web Vitals */}
          <s-section heading={`Core Web Vitals & Lab Metrics (${activeDevice.toUpperCase()})`}>
            <s-paragraph>
              Simulated lab conditions under realistic {activeDevice} network conditions:
            </s-paragraph>

            <s-grid gridtemplatecolumns="repeat(auto-fit, minmax(280px, 1fr))" gap="base">
              {auditData.lighthouseMetrics.map((metric) => (
                <MetricItem key={metric.id} metric={metric} />
              ))}
            </s-grid>
          </s-section>

          {/* Real User Experience (CrUX) */}
          <s-section heading="Real User Experience (Chrome User Experience Report - CrUX)">
            <s-paragraph>
              Field metrics aggregated from real Chrome users visiting your store over 28 days:
            </s-paragraph>

            <s-grid gridtemplatecolumns="repeat(auto-fit, minmax(200px, 1fr))" gap="base">
              <CruxCard
                title="First Contentful Paint (FCP)"
                category={auditData.cruxMetrics.fcp.category}
                percentile={
                  auditData.cruxMetrics.fcp.percentile
                    ? `${auditData.cruxMetrics.fcp.percentile}ms`
                    : null
                }
              />
              <CruxCard
                title="Largest Contentful Paint (LCP)"
                category={auditData.cruxMetrics.lcp.category}
                percentile={
                  auditData.cruxMetrics.lcp.percentile
                    ? `${auditData.cruxMetrics.lcp.percentile}ms`
                    : null
                }
              />
              <CruxCard
                title="Cumulative Layout Shift (CLS)"
                category={auditData.cruxMetrics.cls.category}
                percentile={auditData.cruxMetrics.cls.percentile}
              />
              <CruxCard
                title="Interaction to Next Paint (INP)"
                category={auditData.cruxMetrics.inp.category}
                percentile={
                  auditData.cruxMetrics.inp.percentile
                    ? `${auditData.cruxMetrics.inp.percentile}ms`
                    : null
                }
              />
            </s-grid>
          </s-section>

          {/* Speed Optimization Opportunities */}
          {auditData.speedOpportunities.length > 0 && (
            <s-section heading={`High-Impact Speed Opportunities (${activeDevice.toUpperCase()})`}>
              <s-paragraph>
                Actionable optimizations to directly reduce load time and data transfer:
              </s-paragraph>

              <s-stack direction="block" gap="small-100">
                {auditData.speedOpportunities.slice(0, 6).map((opp) => (
                  <OpportunityCard key={opp.id} opportunity={opp} />
                ))}
              </s-stack>
            </s-section>
          )}

          {/* Technical SEO Checklist */}
          {auditData.seoAudits.length > 0 && (
            <s-section heading="Technical SEO Checklist">
              <s-paragraph>
                Technical factors verified for search engine crawlers:
              </s-paragraph>

              <s-grid gridtemplatecolumns="repeat(auto-fit, minmax(260px, 1fr))" gap="small-100">
                {auditData.seoAudits.map((audit) => (
                  <s-box
                    key={audit.id}
                    padding="base"
                    borderWidth="base"
                    borderRadius="base"
                    background="subdued"
                  >
                    <s-stack direction="inline" gap="small-100" alignitems="center">
                      {audit.passed ? (
                        <CheckCircle2 size={18} color="#008060" />
                      ) : (
                        <AlertTriangle size={18} color="#bf0711" />
                      )}
                      <s-stack direction="block" gap="none">
                        <s-heading>{audit.title}</s-heading>
                        <s-badge tone={audit.passed ? "success" : "critical"}>
                          {audit.displayValue}
                        </s-badge>
                      </s-stack>
                    </s-stack>
                  </s-box>
                ))}
              </s-grid>
            </s-section>
          )}
        </>
      )}

      {/* Recent Historical Audits from MongoDB */}
      {recentAudits && recentAudits.length > 0 && (
        <s-section heading="Recent Audits History (MongoDB)">
          <s-stack direction="block" gap="small-100">
            {recentAudits.map((run) => (
              <s-box
                key={run.id}
                padding="base"
                borderWidth="base"
                borderRadius="base"
                background="subdued"
              >
                <s-stack direction="inline" justifycontent="space-between" alignitems="center">
                  <s-stack direction="block" gap="none">
                    <s-heading>{run.url}</s-heading>
                    <s-text tone="subdued">
                      Dual Audit &bull; {run.formattedDate}
                    </s-text>
                  </s-stack>

                  <s-stack direction="inline" gap="base" alignitems="center">
                    {/* Mobile Scores */}
                    <s-stack direction="inline" gap="small-100" alignitems="center">
                      <s-badge tone="info">📱 Mobile</s-badge>
                      <s-badge
                        tone={
                          (run.mobileSpeed || 0) >= 90
                            ? "success"
                            : (run.mobileSpeed || 0) >= 50
                              ? "warning"
                              : "critical"
                        }
                      >
                        Speed: {run.mobileSpeed ?? "N/A"}
                      </s-badge>
                      <s-badge
                        tone={
                          (run.mobileSeo || 0) >= 90
                            ? "success"
                            : (run.mobileSeo || 0) >= 50
                              ? "warning"
                              : "critical"
                        }
                      >
                        SEO: {run.mobileSeo ?? "N/A"}
                      </s-badge>
                    </s-stack>

                    {/* Desktop Scores */}
                    {run.desktopSpeed !== null && (
                      <s-stack direction="inline" gap="small-100" alignitems="center">
                        <s-badge tone="neutral">💻 Desktop</s-badge>
                        <s-badge
                          tone={
                            (run.desktopSpeed || 0) >= 90
                              ? "success"
                              : (run.desktopSpeed || 0) >= 50
                                ? "warning"
                                : "critical"
                          }
                        >
                          Speed: {run.desktopSpeed}
                        </s-badge>
                        <s-badge
                          tone={
                            (run.desktopSeo || 0) >= 90
                              ? "success"
                              : (run.desktopSeo || 0) >= 50
                                ? "warning"
                                : "critical"
                          }
                        >
                          SEO: {run.desktopSeo}
                        </s-badge>
                      </s-stack>
                    )}

                    <s-button
                      variant="tertiary"
                      onClick={() => {
                        setTargetUrl(run.url);
                        handleRunAudit(run.url);
                      }}
                    >
                      Re-test
                    </s-button>
                  </s-stack>
                </s-stack>
              </s-box>
            ))}
          </s-stack>
        </s-section>
      )}
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
