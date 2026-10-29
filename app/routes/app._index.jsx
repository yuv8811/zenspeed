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
} from "lucide-react";
import { authenticate } from "../shopify.server";
import { runPageSpeedAudit } from "../services/pagespeed.server";
import { connectDB } from "../db.server";
import Audit from "../models/audit.model";
import ScoreCard from "../components/ScoreCard";
import MetricItem from "../components/MetricItem";
import CruxCard from "../components/CruxCard";
import OpportunityCard from "../components/OpportunityCard";
import StatBox from "../components/StatBox";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop || "";
  const defaultUrl = shop ? `https://${shop}` : "https://web.dev/";
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
    const docs = await Audit.find({ shop })
      .sort({ createdAt: -1 })
      .limit(6)
      .lean();

    recentAudits = JSON.parse(JSON.stringify(docs));
    stats.totalAudits = await Audit.countDocuments({ shop });
    if (recentAudits.length > 0) {
      stats.latestPerf = recentAudits[0].scores?.performance ?? null;
      stats.latestSeo = recentAudits[0].scores?.seo ?? null;

      // Before & After comparison (earliest baseline vs latest audit)
      if (stats.totalAudits >= 2) {
        const earliest = await Audit.findOne({ shop }).sort({ createdAt: 1 }).lean();
        const latest = recentAudits[0];

        if (earliest && latest && earliest._id.toString() !== latest._id.toString()) {
          const perfDelta =
            (latest.scores?.performance ?? 0) - (earliest.scores?.performance ?? 0);
          const seoDelta =
            (latest.scores?.seo ?? 0) - (earliest.scores?.seo ?? 0);

          comparison = {
            baselineDate: new Date(earliest.createdAt).toLocaleDateString(),
            latestDate: new Date(latest.createdAt).toLocaleDateString(),
            baselinePerf: earliest.scores?.performance ?? 0,
            latestPerf: latest.scores?.performance ?? 0,
            perfDelta,
            baselineSeo: earliest.scores?.seo ?? 0,
            latestSeo: latest.scores?.seo ?? 0,
            seoDelta,
            url: latest.url,
          };
        }
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
  const strategy = formData.get("strategy") || "mobile";

  try {
    const results = await runPageSpeedAudit({
      url: url.toString(),
      strategy: strategy.toString(),
    });

    // Save audit record to MongoDB
    try {
      await connectDB();
      await Audit.create({
        shop: session.shop,
        url: results.url,
        strategy: results.strategy,
        scores: results.scores,
        lighthouseMetrics: results.lighthouseMetrics,
        cruxMetrics: results.cruxMetrics,
        speedOpportunities: results.speedOpportunities?.slice(0, 10),
      });
    } catch (dbError) {
      console.warn("Could not save audit to MongoDB:", dbError.message);
    }

    return { ok: true, results, error: null };
  } catch (error) {
    return {
      ok: false,
      results: null,
      error: error.message || "Failed to fetch PageSpeed data.",
    };
  }
};

export default function Index() {
  const { defaultUrl, hasApiKey, recentAudits, stats, comparison } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();

  const [targetUrl, setTargetUrl] = useState(defaultUrl);
  const [strategy, setStrategy] = useState("mobile");

  const isLoading =
    ["loading", "submitting"].includes(fetcher.state) &&
    fetcher.formMethod === "POST";

  const auditData = fetcher.data?.results;
  const auditError = fetcher.data?.error;

  useEffect(() => {
    if (fetcher.data?.ok && auditData) {
      shopify.toast?.show("PageSpeed audit completed & saved to MongoDB!");
    } else if (fetcher.data?.error) {
      shopify.toast?.show("Audit failed. Check error details below.");
    }
  }, [fetcher.data, auditData, shopify]);

  const handleRunAudit = (overrideUrl, overrideStrategy) => {
    const urlToTest = (overrideUrl || targetUrl).trim();
    if (!urlToTest) return;

    fetcher.submit(
      { url: urlToTest, strategy: overrideStrategy || strategy },
      { method: "POST" },
    );
  };

  const handleShortcutClick = (path) => {
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
        onClick={() => handleRunAudit(defaultUrl, strategy)}
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
            label="Saved Reports"
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
            Test your storefront&apos;s Core Web Vitals, Google Lighthouse metrics, and technical SEO factors in real time.
          </s-paragraph>

          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-stack direction="block" gap="base">
              <s-text-field
                label="Storefront or Page URL"
                value={targetUrl}
                onInput={(e) => setTargetUrl(e.target.value)}
                placeholder="https://yourstore.myshopify.com"
                required
              />

              <s-stack direction="inline" gap="small-100" alignitems="center">
                <s-text tone="subdued">Quick shortcuts:</s-text>
                <s-button variant="tertiary" onClick={() => handleShortcutClick("/")}>
                  Home Page
                </s-button>
                <s-button variant="tertiary" onClick={() => handleShortcutClick("/collections/all")}>
                  All Products
                </s-button>
                <s-button variant="tertiary" onClick={() => handleShortcutClick("/cart")}>
                  Cart Page
                </s-button>
              </s-stack>

              <s-stack direction="inline" justifycontent="space-between" alignitems="flex-end" gap="base">
                <s-box inlinesize="240px">
                  <s-select
                    label="Device Simulation"
                    value={strategy}
                    onInput={(e) => setStrategy(e.target.value)}
                  >
                    <s-option value="mobile">Mobile (Google Standard)</s-option>
                    <s-option value="desktop">Desktop</s-option>
                  </s-select>
                </s-box>

                <s-button
                  variant="primary"
                  onClick={() => handleRunAudit()}
                  disabled={isLoading}
                >
                  {isLoading ? "Auditing Store..." : "Run PageSpeed Audit"}
                </s-button>
              </s-stack>
            </s-stack>
          </s-box>

          {isLoading && (
            <s-banner tone="info" heading="Auditing storefront with Google Lighthouse...">
              <s-paragraph>
                Measuring Core Web Vitals, Largest Contentful Paint, Cumulative Layout Shift, and SEO factors for <strong>{targetUrl}</strong>. This test typically takes 10–15 seconds.
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

      {/* Audit Results View */}
      {auditData && !isLoading && (
        <>
          {/* Lighthouse Category Scores */}
          <s-section heading={`Lighthouse Category Scores (${auditData.strategy.toUpperCase()})`}>
            <s-paragraph>
              Audited URL: <s-link href={auditData.url} target="_blank">{auditData.url}</s-link>
            </s-paragraph>

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
          </s-section>

          {/* Core Web Vitals */}
          <s-section heading="Core Web Vitals &amp; Lab Metrics">
            <s-paragraph>
              Simulated lab conditions under realistic mobile network conditions:
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
            <s-section heading="High-Impact Speed Opportunities">
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
            {recentAudits.map((hist) => (
              <s-box
                key={hist._id}
                padding="base"
                borderWidth="base"
                borderRadius="base"
                background="subdued"
              >
                <s-stack direction="inline" justifycontent="space-between" alignitems="center">
                  <s-stack direction="block" gap="none">
                    <s-heading>{hist.url}</s-heading>
                    <s-text tone="subdued">
                      Device: {hist.strategy?.toUpperCase()} &bull; {new Date(hist.createdAt).toLocaleString()}
                    </s-text>
                  </s-stack>

                  <s-stack direction="inline" gap="small-100" alignitems="center">
                    <s-badge
                      tone={
                        (hist.scores?.performance || 0) >= 90
                          ? "success"
                          : (hist.scores?.performance || 0) >= 50
                            ? "warning"
                            : "critical"
                      }
                    >
                      Speed: {hist.scores?.performance ?? "N/A"}
                    </s-badge>
                    <s-badge
                      tone={
                        (hist.scores?.seo || 0) >= 90
                          ? "success"
                          : (hist.scores?.seo || 0) >= 50
                            ? "warning"
                            : "critical"
                      }
                    >
                      SEO: {hist.scores?.seo ?? "N/A"}
                    </s-badge>

                    <s-button
                      variant="tertiary"
                      onClick={() => {
                        setTargetUrl(hist.url);
                        setStrategy(hist.strategy || "mobile");
                        handleRunAudit(hist.url, hist.strategy || "mobile");
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
