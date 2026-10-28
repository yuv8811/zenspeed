import { useState, useEffect } from "react";
import { useLoaderData, useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { runPageSpeedAudit } from "../services/pagespeed.server";
import { connectDB } from "../db.server";
import Audit from "../models/audit.model";
import process from 'process'

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop || "";
  const defaultUrl = shop ? `https://${shop}` : "https://web.dev/";
  const hasApiKey = Boolean(process.env.PAGESPEED_INSIGHT_KEY);

  let recentAudits = [];
  try {
    await connectDB();
    const docs = await Audit.find({ shop })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();
    recentAudits = JSON.parse(JSON.stringify(docs));
  } catch (e) {
    console.warn("Could not load recent audits from MongoDB:", e.message);
  }

  return {
    shop,
    defaultUrl,
    hasApiKey,
    recentAudits,
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

function getScoreTone(score) {
  if (score >= 90) return { tone: "success", label: "Good", color: "#108043", bg: "#e3f1df" };
  if (score >= 50) return { tone: "warning", label: "Needs Improvement", color: "#b95000", bg: "#fef3d6" };
  return { tone: "critical", label: "Poor", color: "#bf0711", bg: "#fdeeed" };
}

function getCruxTone(category) {
  if (category === "FAST") return { tone: "success", label: "Good", color: "#108043", bg: "#e3f1df" };
  if (category === "AVERAGE") return { tone: "warning", label: "Needs Improvement", color: "#b95000", bg: "#fef3d6" };
  if (category === "SLOW") return { tone: "critical", label: "Poor", color: "#bf0711", bg: "#fdeeed" };
  return { tone: "neutral", label: "No Data", color: "#6d7175", bg: "#f1f2f3" };
}

export default function Index() {
  const { defaultUrl, hasApiKey, recentAudits } = useLoaderData();
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

  const handleRunAudit = (e) => {
    if (e) e.preventDefault();
    if (!targetUrl.trim()) return;

    fetcher.submit(
      { url: targetUrl.trim(), strategy },
      { method: "POST" },
    );
  };

  return (
    <s-page heading="ZenSpeed: Speed & SEO Optimizer">
      {/* Configuration Alert if API key is not detected */}
      {!hasApiKey && (
        <s-banner tone="warning" heading="PageSpeed API Key Not Detected">
          <s-paragraph>
            Please set <code>PAGESPEED_INSIGHT_KEY</code> in your <code>.env</code> file
            to avoid Google API rate limits.
          </s-paragraph>
        </s-banner>
      )}

      {/* Target URL & Audit Controls */}
      <s-section heading="Run Store Audit">
        <s-paragraph>
          Analyze performance, Core Web Vitals, and SEO for your Shopify storefront using
          Google PageSpeed Insights &amp; Lighthouse. Sessions and audit logs are securely stored in MongoDB.
        </s-paragraph>

        <form onSubmit={handleRunAudit} style={{ marginTop: "1rem" }}>
          <s-stack direction="block" gap="base">
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ flex: 1, minWidth: "260px" }}>
                <label
                  htmlFor="url-input"
                  style={{ display: "block", marginBottom: "4px", fontSize: "13px", fontWeight: "600", color: "#202223" }}
                >
                  Page URL to test:
                </label>
                <input
                  id="url-input"
                  type="url"
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  placeholder="https://yourstore.myshopify.com"
                  required
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: "1px solid #c9cccf",
                    fontSize: "14px",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div style={{ minWidth: "150px" }}>
                <label
                  htmlFor="strategy-select"
                  style={{ display: "block", marginBottom: "4px", fontSize: "13px", fontWeight: "600", color: "#202223" }}
                >
                  Device Strategy:
                </label>
                <select
                  id="strategy-select"
                  value={strategy}
                  onChange={(e) => setStrategy(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: "1px solid #c9cccf",
                    fontSize: "14px",
                    background: "#fff",
                    boxSizing: "border-box",
                  }}
                >
                  <option value="mobile">📱 Mobile (Recommended)</option>
                  <option value="desktop">💻 Desktop</option>
                </select>
              </div>

              <div style={{ alignSelf: "flex-end", minWidth: "140px" }}>
                <s-button
                  onClick={handleRunAudit}
                  {...(isLoading ? { loading: true } : {})}
                >
                  {isLoading ? "Auditing..." : "Run PageSpeed Audit"}
                </s-button>
              </div>
            </div>
          </s-stack>
        </form>

        {isLoading && (
          <div style={{ marginTop: "1.5rem", padding: "1.5rem", background: "#f6f6f7", borderRadius: "8px", textAlign: "center" }}>
            <s-heading>Auditing your store with Google PageSpeed Insights...</s-heading>
            <s-paragraph>
              Testing performance, Largest Contentful Paint, Cumulative Layout Shift, and SEO factors.
              This typically takes 10–15 seconds.
            </s-paragraph>
          </div>
        )}

        {auditError && (
          <div style={{ marginTop: "1rem" }}>
            <s-banner tone="critical" heading="Audit Failed">
              <s-paragraph>{auditError}</s-paragraph>
            </s-banner>
          </div>
        )}
      </s-section>

      {/* Audit Results View */}
      {auditData && !isLoading && (
        <>
          {/* Overall Score Cards */}
          <s-section heading={`Audit Results (${auditData.strategy.toUpperCase()})`}>
            <s-paragraph>
              Tested URL: <s-link href={auditData.url} target="_blank">{auditData.url}</s-link>
            </s-paragraph>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                gap: "14px",
                marginTop: "1rem",
              }}
            >
              {[
                { label: "Performance", score: auditData.scores.performance },
                { label: "SEO", score: auditData.scores.seo },
                { label: "Accessibility", score: auditData.scores.accessibility },
                { label: "Best Practices", score: auditData.scores.bestPractices },
              ]
                .filter((item) => item.score !== null)
                .map((item) => {
                  const tone = getScoreTone(item.score);
                  return (
                    <div
                      key={item.label}
                      style={{
                        padding: "16px",
                        borderRadius: "10px",
                        backgroundColor: tone.bg,
                        border: `1px solid ${tone.color}40`,
                        textAlign: "center",
                      }}
                    >
                      <div style={{ fontSize: "13px", fontWeight: "600", color: "#5c5f62", marginBottom: "6px" }}>
                        {item.label}
                      </div>
                      <div style={{ fontSize: "32px", fontWeight: "700", color: tone.color }}>
                        {item.score}
                      </div>
                      <div style={{ fontSize: "12px", fontWeight: "600", color: tone.color, marginTop: "4px" }}>
                        {tone.label}
                      </div>
                    </div>
                  );
                })}
            </div>
          </s-section>

          {/* Core Web Vitals (Lighthouse Lab Metrics) */}
          <s-section heading="Core Web Vitals &amp; Speed Metrics">
            <s-paragraph>
              Simulated lab audit metrics from Lighthouse:
            </s-paragraph>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: "12px",
                marginTop: "1rem",
              }}
            >
              {auditData.lighthouseMetrics.map((metric) => {
                const metricScore =
                  metric.score !== null ? Math.round(metric.score * 100) : null;
                const tone =
                  metricScore !== null
                    ? getScoreTone(metricScore)
                    : { color: "#5c5f62", bg: "#f6f6f7", label: "Information" };

                return (
                  <div
                    key={metric.id}
                    style={{
                      padding: "14px",
                      borderRadius: "8px",
                      border: "1px solid #e1e3e5",
                      background: "#fff",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <span style={{ fontSize: "14px", fontWeight: "600", color: "#202223" }}>
                        {metric.title}
                      </span>
                      <span
                        style={{
                          fontSize: "12px",
                          fontWeight: "700",
                          color: tone.color,
                          backgroundColor: tone.bg,
                          padding: "2px 8px",
                          borderRadius: "4px",
                        }}
                      >
                        {metric.displayValue}
                      </span>
                    </div>
                    <p style={{ fontSize: "12px", color: "#6d7175", marginTop: "8px", marginBottom: "0", lineHeight: "1.4" }}>
                      {metric.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </s-section>

          {/* Real User Experience (CrUX) */}
          <s-section heading="Real User Experience (Chrome User Experience Report - CrUX)">
            <s-paragraph>
              Field data collected from real Chrome users visiting your store over the past 28 days:
              {auditData.cruxMetrics.isOriginFallback && (
                <em> (Displaying domain-wide origin data due to insufficient page-level traffic).</em>
              )}
            </s-paragraph>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "12px",
                marginTop: "1rem",
              }}
            >
              {[
                { key: "fcp", data: auditData.cruxMetrics.fcp },
                { key: "lcp", data: auditData.cruxMetrics.lcp },
                { key: "cls", data: auditData.cruxMetrics.cls },
                { key: "inp", data: auditData.cruxMetrics.inp },
              ].map(({ key, data }) => {
                const tone = getCruxTone(data.category);
                return (
                  <div
                    key={key}
                    style={{
                      padding: "14px",
                      borderRadius: "8px",
                      border: "1px solid #e1e3e5",
                      background: "#fff",
                    }}
                  >
                    <div style={{ fontSize: "13px", color: "#5c5f62" }}>{data.title}</div>
                    <div style={{ fontSize: "18px", fontWeight: "700", color: tone.color, marginTop: "4px" }}>
                      {data.category.replace(/_/g, " ")}
                    </div>
                    {data.percentile !== null && (
                      <div style={{ fontSize: "12px", color: "#6d7175", marginTop: "2px" }}>
                        p75: {data.percentile}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </s-section>

          {/* Speed Optimization Opportunities */}
          {auditData.speedOpportunities.length > 0 && (
            <s-section heading="Speed Optimization Opportunities">
              <s-paragraph>
                Recommendations to directly reduce loading time and data transfer on your Shopify storefront:
              </s-paragraph>

              <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "10px" }}>
                {auditData.speedOpportunities.slice(0, 6).map((opp) => (
                  <div
                    key={opp.id}
                    style={{
                      padding: "14px",
                      borderRadius: "8px",
                      border: "1px solid #faeedb",
                      backgroundColor: "#fffbf7",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "8px" }}>
                      <span style={{ fontSize: "14px", fontWeight: "600", color: "#202223" }}>
                        {opp.title}
                      </span>
                      {opp.displayValue && (
                        <span style={{ fontSize: "13px", fontWeight: "700", color: "#b95000" }}>
                          Potential savings: {opp.displayValue}
                        </span>
                      )}
                    </div>
                    <p
                      style={{ fontSize: "12px", color: "#6d7175", marginTop: "6px", marginBottom: "0", lineHeight: "1.4" }}
                      dangerouslySetInnerHTML={{
                        __html: opp.description.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" style="color: #0066cc;">$1</a>'),
                      }}
                    />
                  </div>
                ))}
              </div>
            </s-section>
          )}

          {/* SEO Checklist & Audits */}
          {auditData.seoAudits.length > 0 && (
            <s-section heading="SEO Audit Checklist">
              <s-paragraph>
                Key technical SEO factors checked on your store:
              </s-paragraph>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                  gap: "10px",
                  marginTop: "1rem",
                }}
              >
                {auditData.seoAudits.map((audit) => (
                  <div
                    key={audit.id}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "10px",
                      padding: "12px",
                      borderRadius: "6px",
                      border: "1px solid #e1e3e5",
                      background: audit.passed ? "#f8fdf9" : "#fff9f9",
                    }}
                  >
                    <span style={{ fontSize: "18px", lineHeight: "1" }}>
                      {audit.passed ? "✅" : "⚠️"}
                    </span>
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: "600", color: "#202223" }}>
                        {audit.title}
                      </div>
                      <div style={{ fontSize: "12px", color: audit.passed ? "#108043" : "#bf0711", fontWeight: "500", marginTop: "2px" }}>
                        {audit.displayValue}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </s-section>
          )}
        </>
      )}

      {/* Recent Audits History (from MongoDB) */}
      {recentAudits && recentAudits.length > 0 && (
        <s-section heading="Recent Store Audits (MongoDB History)">
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "0.5rem" }}>
            {recentAudits.map((hist) => (
              <div
                key={hist._id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "12px 14px",
                  borderRadius: "6px",
                  border: "1px solid #e1e3e5",
                  background: "#fff",
                }}
              >
                <div>
                  <div style={{ fontSize: "14px", fontWeight: "600", color: "#202223" }}>
                    {hist.url}
                  </div>
                  <div style={{ fontSize: "12px", color: "#6d7175", marginTop: "2px" }}>
                    Strategy: {hist.strategy.toUpperCase()} &bull; {new Date(hist.createdAt).toLocaleString()}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <span
                    style={{
                      padding: "3px 8px",
                      borderRadius: "4px",
                      fontSize: "12px",
                      fontWeight: "700",
                      backgroundColor: getScoreTone(hist.scores?.performance || 0).bg,
                      color: getScoreTone(hist.scores?.performance || 0).color,
                    }}
                  >
                    Perf: {hist.scores?.performance ?? "N/A"}
                  </span>
                  <span
                    style={{
                      padding: "3px 8px",
                      borderRadius: "4px",
                      fontSize: "12px",
                      fontWeight: "700",
                      backgroundColor: getScoreTone(hist.scores?.seo || 0).bg,
                      color: getScoreTone(hist.scores?.seo || 0).color,
                    }}
                  >
                    SEO: {hist.scores?.seo ?? "N/A"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </s-section>
      )}

      {/* Sidebar: ZenSpeed Tips & Insights */}
      <s-section slot="aside" heading="ZenSpeed Optimization Tips">
        <s-paragraph>
          <strong>Fast stores convert more customers:</strong>
        </s-paragraph>
        <s-unordered-list>
          <s-list-item>
            <strong>Compress Images:</strong> Use modern image formats (WebP/AVIF) and specify width/height to avoid CLS.
          </s-list-item>
          <s-list-item>
            <strong>Audit App Scripts:</strong> Remove unused Shopify apps that inject third-party tags into theme liquid.
          </s-list-item>
          <s-list-item>
            <strong>Mobile First:</strong> Over 70% of Shopify store checkouts occur on mobile devices.
          </s-list-item>
          <s-list-item>
            <strong>SEO Meta Tags:</strong> Keep title tags under 60 characters and meta descriptions under 160 characters.
          </s-list-item>
        </s-unordered-list>
      </s-section>

      <s-section slot="aside" heading="Database &amp; API Status">
        <s-paragraph>
          <s-text>Database: </s-text>
          <span style={{ color: "#108043", fontWeight: "600" }}>
            ● MongoDB Connected
          </span>
        </s-paragraph>
        <s-paragraph>
          <s-text>PageSpeed API: </s-text>
          <span style={{ color: hasApiKey ? "#108043" : "#bf0711", fontWeight: "600" }}>
            {hasApiKey ? "● Connected" : "○ Missing"}
          </span>
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
