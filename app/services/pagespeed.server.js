/**
 * PageSpeed Insights API service for ZenSpeed
 */

const PAGESPEED_API_ENDPOINT =
  "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

/**
 * Run a PageSpeed Insights audit on the specified URL.
 *
 * @param {Object} options
 * @param {string} options.url - The target URL to test.
 * @param {('mobile'|'desktop')} [options.strategy='mobile'] - Device strategy to simulate.
 * @param {string[]} [options.categories] - Lighthouse categories to audit.
 * @returns {Promise<Object>} Formatted audit results.
 */
export async function runPageSpeedAudit({
  url: targetUrl,
  strategy = "mobile",
  categories = ["PERFORMANCE", "SEO", "ACCESSIBILITY", "BEST_PRACTICES"],
}) {
  if (!targetUrl) {
    throw new Error("Target URL is required");
  }

  // Ensure URL has protocol
  let normalizedUrl = targetUrl.trim();
  if (!/^https?:\/\//i.test(normalizedUrl)) {
    normalizedUrl = `https://${normalizedUrl}`;
  }

  const endpoint = new URL(PAGESPEED_API_ENDPOINT);
  endpoint.searchParams.set("url", normalizedUrl);
  endpoint.searchParams.set("strategy", strategy);

  // Add Google API key if configured
  // eslint-disable-next-line no-undef
  const apiKey = (process.env.PAGESPEED_INSIGHT_KEY || "").trim();
  if (apiKey) {
    endpoint.searchParams.set("key", apiKey);
  }

  // Add requested categories
  categories.forEach((cat) => {
    endpoint.searchParams.append("category", cat);
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

  try {
    const response = await fetch(endpoint.toString(), {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorJson = await response.json().catch(() => null);
      const errorMessage =
        errorJson?.error?.message ||
        `PageSpeed Insights API request failed with HTTP ${response.status}`;
      throw new Error(errorMessage);
    }

    const data = await response.json();
    return formatPageSpeedResponse(data, normalizedUrl, strategy);
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      throw new Error(
        "PageSpeed Insights request timed out. Please try again.",
      );
    }
    throw error;
  }
}

/**
 * Run simultaneous Mobile and Desktop PageSpeed audits in parallel.
 *
 * @param {Object} options
 * @param {string} options.url - The target URL to test.
 * @param {string[]} [options.categories]
 * @returns {Promise<{ mobile: Object, desktop: Object }>}
 */
export async function runDualPageSpeedAudit({
  url: targetUrl,
  categories = ["PERFORMANCE", "SEO", "ACCESSIBILITY", "BEST_PRACTICES"],
}) {
  const [mobile, desktop] = await Promise.all([
    runPageSpeedAudit({ url: targetUrl, strategy: "mobile", categories }),
    runPageSpeedAudit({ url: targetUrl, strategy: "desktop", categories }),
  ]);

  return { mobile, desktop };
}

/**
 * Format raw PageSpeed Insights API response into structured metrics for the dashboard.
 */
function formatPageSpeedResponse(data, auditedUrl, strategy) {
  const lighthouse = data.lighthouseResult || {};
  const categories = lighthouse.categories || {};
  const audits = lighthouse.audits || {};
  const cruxExperience = data.loadingExperience || {};
  const originExperience = data.originLoadingExperience || {};

  // Extract category scores (0 - 100)
  const scores = {
    performance: Math.round((categories.performance?.score ?? 0) * 100),
    seo: Math.round((categories.seo?.score ?? 0) * 100),
    accessibility: categories.accessibility
      ? Math.round(categories.accessibility.score * 100)
      : null,
    bestPractices: categories["best-practices"]
      ? Math.round(categories["best-practices"].score * 100)
      : null,
  };

  // Extract key Core Web Vitals from Lighthouse Lab data
  const lighthouseMetrics = [
    {
      id: "fcp",
      title: "First Contentful Paint (FCP)",
      displayValue: audits["first-contentful-paint"]?.displayValue || "N/A",
      score: audits["first-contentful-paint"]?.score ?? 0,
      description: "Marks the time at which the first text or image is painted.",
    },
    {
      id: "lcp",
      title: "Largest Contentful Paint (LCP)",
      displayValue: audits["largest-contentful-paint"]?.displayValue || "N/A",
      score: audits["largest-contentful-paint"]?.score ?? 0,
      description: "Marks the time at which the largest text or image is painted.",
    },
    {
      id: "cls",
      title: "Cumulative Layout Shift (CLS)",
      displayValue: audits["cumulative-layout-shift"]?.displayValue || "N/A",
      score: audits["cumulative-layout-shift"]?.score ?? 0,
      description: "Measures movement of visible elements within viewport.",
    },
    {
      id: "tbt",
      title: "Total Blocking Time (TBT)",
      displayValue: audits["total-blocking-time"]?.displayValue || "N/A",
      score: audits["total-blocking-time"]?.score ?? 0,
      description: "Sum of all time periods between FCP and Time to Interactive.",
    },
    {
      id: "speed_index",
      title: "Speed Index",
      displayValue: audits["speed-index"]?.displayValue || "N/A",
      score: audits["speed-index"]?.score ?? 0,
      description: "Shows how quickly the contents of a page are visibly populated.",
    },
  ];

  // Extract Chrome User Experience Report (CrUX) Field Data
  const cruxMetrics = {
    fcp: extractMetric(cruxExperience, originExperience, "FIRST_CONTENTFUL_PAINT_MS"),
    lcp: extractMetric(cruxExperience, originExperience, "LARGEST_CONTENTFUL_PAINT_MS"),
    cls: extractMetric(cruxExperience, originExperience, "CUMULATIVE_LAYOUT_SHIFT_SCORE", true),
    inp: extractMetric(cruxExperience, originExperience, "INTERACTION_TO_NEXT_PAINT"),
    overallCategory: cruxExperience.overall_category || originExperience.overall_category || "NO_DATA",
    isOriginFallback: !cruxExperience.metrics && Boolean(originExperience.metrics),
  };

  // Extract actionable optimization opportunities
  const speedOpportunities = [];
  const opportunityAuditKeys = [
    "render-blocking-resources",
    "modern-image-formats",
    "offscreen-images",
    "unminified-css",
    "unminified-javascript",
    "unused-css-rules",
    "unused-javascript",
    "uses-optimized-images",
    "uses-text-compression",
    "uses-responsive-images",
    "efficient-animated-content",
    "duplicated-javascript",
  ];

  opportunityAuditKeys.forEach((key) => {
    const item = audits[key];
    if (item && item.score !== null && item.score < 0.9) {
      speedOpportunities.push({
        id: item.id,
        title: item.title,
        displayValue: item.displayValue || "",
        score: item.score,
        savingsMs: item.details?.overallSavingsMs || 0,
        savingsBytes: item.details?.overallSavingsBytes || 0,
      });
    }
  });

  // Extract SEO audits
  const seoAudits = [];
  const seoAuditKeys = [
    "document-title",
    "meta-description",
    "http-status-code",
    "link-text",
    "crawlable-anchors",
    "is-crawlable",
    "robots-txt",
    "image-alt",
    "canonical",
  ];

  seoAuditKeys.forEach((key) => {
    const item = audits[key];
    if (item) {
      seoAudits.push({
        id: item.id,
        title: item.title,
        passed: item.score === 1,
        displayValue: item.displayValue || (item.score === 1 ? "Passed" : "Action Required"),
        description: item.description,
      });
    }
  });

  return {
    url: auditedUrl,
    strategy,
    testedAt: new Date().toISOString(),
    scores,
    lighthouseMetrics,
    cruxMetrics,
    speedOpportunities,
    seoAudits,
  };
}

/**
 * Helper to extract CrUX metric data safely
 */
function extractMetric(pageExp, originExp, metricKey, isCls = false) {
  const metric =
    pageExp?.metrics?.[metricKey] || originExp?.metrics?.[metricKey];

  if (!metric) {
    return { category: "NO_DATA", percentile: null };
  }

  return {
    category: metric.category || "NO_DATA",
    percentile: isCls
      ? (metric.percentile / 100).toFixed(2)
      : Math.round(metric.percentile || 0),
  };
}
