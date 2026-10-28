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

  // Lighthouse Core Web Vitals & Speed metrics
  const lighthouseMetrics = [
    {
      id: "fcp",
      title: "First Contentful Paint (FCP)",
      displayValue: audits["first-contentful-paint"]?.displayValue || "N/A",
      score: audits["first-contentful-paint"]?.score ?? null,
      description:
        "FCP marks the time at which the first text or image is painted.",
    },
    {
      id: "lcp",
      title: "Largest Contentful Paint (LCP)",
      displayValue: audits["largest-contentful-paint"]?.displayValue || "N/A",
      score: audits["largest-contentful-paint"]?.score ?? null,
      description:
        "LCP marks the time at which the largest text or image is painted.",
    },
    {
      id: "tbt",
      title: "Total Blocking Time (TBT)",
      displayValue: audits["total-blocking-time"]?.displayValue || "N/A",
      score: audits["total-blocking-time"]?.score ?? null,
      description:
        "Sum of all time periods between FCP and Time to Interactive when task length exceeded 50ms.",
    },
    {
      id: "cls",
      title: "Cumulative Layout Shift (CLS)",
      displayValue: audits["cumulative-layout-shift"]?.displayValue || "N/A",
      score: audits["cumulative-layout-shift"]?.score ?? null,
      description:
        "Measures the movement of visible elements within the viewport.",
    },
    {
      id: "speedIndex",
      title: "Speed Index",
      displayValue: audits["speed-index"]?.displayValue || "N/A",
      score: audits["speed-index"]?.score ?? null,
      description:
        "Speed Index shows how quickly the contents of a page are visibly populated.",
    },
    {
      id: "interactive",
      title: "Time to Interactive (TTI)",
      displayValue: audits["interactive"]?.displayValue || "N/A",
      score: audits["interactive"]?.score ?? null,
      description:
        "TTI is the amount of time it takes for the page to become fully interactive.",
    },
  ];

  // CrUX Real-User Field Data (Chrome User Experience Report)
  const cruxMetrics = {
    fcp: {
      title: "First Contentful Paint",
      category:
        cruxExperience.metrics?.FIRST_CONTENTFUL_PAINT_MS?.category ||
        originExperience.metrics?.FIRST_CONTENTFUL_PAINT_MS?.category ||
        "DATA_UNAVAILABLE",
      percentile:
        cruxExperience.metrics?.FIRST_CONTENTFUL_PAINT_MS?.percentile ||
        originExperience.metrics?.FIRST_CONTENTFUL_PAINT_MS?.percentile ||
        null,
    },
    lcp: {
      title: "Largest Contentful Paint",
      category:
        cruxExperience.metrics?.LARGEST_CONTENTFUL_PAINT_MS?.category ||
        originExperience.metrics?.LARGEST_CONTENTFUL_PAINT_MS?.category ||
        "DATA_UNAVAILABLE",
      percentile:
        cruxExperience.metrics?.LARGEST_CONTENTFUL_PAINT_MS?.percentile ||
        originExperience.metrics?.LARGEST_CONTENTFUL_PAINT_MS?.percentile ||
        null,
    },
    cls: {
      title: "Cumulative Layout Shift",
      category:
        cruxExperience.metrics?.CUMULATIVE_LAYOUT_SHIFT_SCORE?.category ||
        originExperience.metrics?.CUMULATIVE_LAYOUT_SHIFT_SCORE?.category ||
        "DATA_UNAVAILABLE",
      percentile:
        cruxExperience.metrics?.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile !==
        undefined
          ? (
              (cruxExperience.metrics?.CUMULATIVE_LAYOUT_SHIFT_SCORE
                ?.percentile ||
                originExperience.metrics?.CUMULATIVE_LAYOUT_SHIFT_SCORE
                  ?.percentile) / 100
            ).toFixed(2)
          : null,
    },
    inp: {
      title: "Interaction to Next Paint",
      category:
        cruxExperience.metrics?.INTERACTION_TO_NEXT_PAINT?.category ||
        originExperience.metrics?.INTERACTION_TO_NEXT_PAINT?.category ||
        "DATA_UNAVAILABLE",
      percentile:
        cruxExperience.metrics?.INTERACTION_TO_NEXT_PAINT?.percentile ||
        originExperience.metrics?.INTERACTION_TO_NEXT_PAINT?.percentile ||
        null,
    },
    overallCategory:
      cruxExperience.overall_category ||
      originExperience.overall_category ||
      "DATA_UNAVAILABLE",
    isOriginFallback: !cruxExperience.metrics && !!originExperience.metrics,
  };

  // Extract Speed Opportunities (audits with potential byte/time savings)
  const speedOpportunities = Object.keys(audits)
    .filter((key) => {
      const audit = audits[key];
      return (
        audit &&
        audit.details &&
        audit.details.type === "opportunity" &&
        audit.score !== null &&
        audit.score < 0.9
      );
    })
    .map((key) => {
      const audit = audits[key];
      return {
        id: key,
        title: audit.title,
        displayValue: audit.displayValue || "",
        score: audit.score,
        description: audit.description,
        savingsMs: audit.details?.overallSavingsMs,
        savingsBytes: audit.details?.overallSavingsBytes,
      };
    })
    .sort((a, b) => (b.savingsMs || 0) - (a.savingsMs || 0));

  // Extract SEO Audits / Checklist
  const seoAuditKeys = [
    "document-title",
    "meta-description",
    "link-text",
    "crawlable-anchors",
    "is-crawlable",
    "robots-txt",
    "image-alt",
    "font-size",
    "canonical",
    "structured-data",
    "tap-targets",
    "http-status-code",
  ];

  const seoAudits = seoAuditKeys
    .map((key) => audits[key])
    .filter(Boolean)
    .map((audit) => ({
      id: audit.id,
      title: audit.title,
      description: audit.description,
      score: audit.score,
      displayValue: audit.displayValue || (audit.score === 1 ? "Passed" : "Needs Attention"),
      passed: audit.score === 1,
    }));

  return {
    url: auditedUrl,
    strategy,
    fetchTime: lighthouse.fetchTime || new Date().toISOString(),
    scores,
    lighthouseMetrics,
    cruxMetrics,
    speedOpportunities,
    seoAudits,
  };
}

