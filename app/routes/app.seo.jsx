import { useState, useEffect } from "react";
import { useLoaderData, useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  Globe,
  Copy,
  Sparkles,
  Search,
  FileText,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { authenticate } from "../shopify.server";
import { connectDB } from "../db.server";
import Settings from "../models/settings.model";
import { getStoreSeoOverview, bulkApplySeoMeta } from "../services/seo.server";
import StatBox from "../components/StatBox";

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop || "";

  let settings = null;
  try {
    await connectDB();
    settings = await Settings.findOne({ shop }).lean();
  } catch (e) {
    console.warn("Could not load settings:", e.message);
  }

  // Fetch shop details for preview & SEO overview
  const response = await admin.graphql(
    `#graphql
    query getShopDetails {
      shop {
        name
        myshopifyDomain
        primaryDomain {
          url
        }
      }
    }`,
  );
  const json = await response.json();
  const shopData = json.data?.shop || {};

  const seoOverview = await getStoreSeoOverview(admin, { maxProducts: 50 });

  return {
    shopName: shopData.name || "My Store",
    storeUrl: shopData.primaryDomain?.url || `https://${shop}`,
    seoOverview: {
      totalProducts: seoOverview.totalProducts,
      missingSeoTitleCount: seoOverview.missingSeoTitleCount,
      missingSeoDescCount: seoOverview.missingSeoDescCount,
      duplicateTitleCount: seoOverview.duplicateTitleCount,
    },
    settings: {
      jsonLdSchema: settings?.jsonLdSchema ?? true,
      metaTitleTemplate: settings?.metaTitleTemplate || "{title} | {shop_name}",
      metaDescriptionTemplate:
        settings?.metaDescriptionTemplate ||
        "Shop {title} at {shop_name}. Find top quality, fast shipping, and great offers today.",
    },
  };
};

export const action = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop || "";
  const formData = await request.formData();
  const intent = formData.get("intent");

  const metaTitleTemplate =
    formData.get("metaTitleTemplate")?.toString() || "{title} | {shop_name}";
  const metaDescriptionTemplate =
    formData.get("metaDescriptionTemplate")?.toString() || "";
  const jsonLdSchema = formData.get("jsonLdSchema") === "true";

  if (intent === "save_settings") {
    try {
      await connectDB();
      await Settings.findOneAndUpdate(
        { shop },
        {
          metaTitleTemplate,
          metaDescriptionTemplate,
          jsonLdSchema,
        },
        { upsert: true, new: true },
      );
      return { ok: true, message: "SEO & Schema settings saved successfully!" };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  if (intent === "bulk_apply_meta") {
    const shopName = formData.get("shopName")?.toString() || "Store";
    try {
      const result = await bulkApplySeoMeta({
        admin,
        shopName,
        titleTemplate: metaTitleTemplate,
        descriptionTemplate: metaDescriptionTemplate,
        maxProducts: 50,
      });

      return {
        ok: true,
        message: `Updated SEO meta tags for ${result.updatedCount} products!`,
      };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  return { ok: false, error: "Invalid intent" };
};

export default function SeoPage() {
  const {
    shopName,
    storeUrl,
    seoOverview,
    settings: initialSettings,
  } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();

  const [metaTitleTemplate, setMetaTitleTemplate] = useState(
    initialSettings.metaTitleTemplate,
  );
  const [metaDescriptionTemplate, setMetaDescriptionTemplate] = useState(
    initialSettings.metaDescriptionTemplate,
  );
  const [jsonLdSchema, setJsonLdSchema] = useState(initialSettings.jsonLdSchema);
  const [copied, setCopied] = useState(false);

  const isSubmitting = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.data?.message) {
      shopify.toast?.show(fetcher.data.message);
    } else if (fetcher.data?.error) {
      shopify.toast?.show(`Error: ${fetcher.data.error}`);
    }
  }, [fetcher.data, shopify]);

  const handleSave = () => {
    fetcher.submit(
      {
        intent: "save_settings",
        metaTitleTemplate,
        metaDescriptionTemplate,
        jsonLdSchema: jsonLdSchema ? "true" : "false",
      },
      { method: "POST" },
    );
  };

  const handleBulkApply = () => {
    fetcher.submit(
      {
        intent: "bulk_apply_meta",
        shopName,
        metaTitleTemplate,
        metaDescriptionTemplate,
      },
      { method: "POST" },
    );
  };

  const previewTitle = metaTitleTemplate
    .replace(/\{title\}/gi, "Premium Snowboard Pro")
    .replace(/\{shop_name\}/gi, shopName);

  const previewDescription = metaDescriptionTemplate
    .replace(/\{title\}/gi, "Premium Snowboard Pro")
    .replace(/\{shop_name\}/gi, shopName);

  const sampleJsonLd = `{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Premium Snowboard Pro",
  "image": ["${storeUrl}/cdn/shop/products/snowboard.jpg"],
  "description": "${previewDescription}",
  "brand": {
    "@type": "Brand",
    "name": "${shopName}"
  },
  "offers": {
    "@type": "Offer",
    "url": "${storeUrl}/products/premium-snowboard-pro",
    "priceCurrency": "USD",
    "price": "149.00",
    "availability": "https://schema.org/InStock"
  }
}`;

  const copyToClipboard = () => {
    navigator.clipboard?.writeText(sampleJsonLd);
    setCopied(true);
    shopify.toast?.show("JSON-LD snippet copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  const totalIssues =
    seoOverview.missingSeoTitleCount +
    seoOverview.missingSeoDescCount +
    seoOverview.duplicateTitleCount;

  return (
    <s-page heading="SEO &amp; Structured Data (JSON-LD)">
      {/* Primary Action Button */}
      <s-button
        slot="primary-action"
        variant="primary"
        onClick={handleSave}
        disabled={isSubmitting}
      >
        {isSubmitting ? "Saving Changes..." : "Save SEO Settings"}
      </s-button>

      {/* SEO Health Overview Cards */}
      <s-section>
        <s-grid gridtemplatecolumns="repeat(auto-fit, minmax(200px, 1fr))" gap="base">
          <StatBox
            label="Scanned Catalog"
            value={seoOverview.totalProducts}
            subtext="Products analyzed"
            icon={Search}
            tone="neutral"
          />
          <StatBox
            label="Missing Meta Titles"
            value={seoOverview.missingSeoTitleCount}
            subtext={
              seoOverview.missingSeoTitleCount === 0
                ? "All custom optimized"
                : "Using fallback handle"
            }
            icon={FileText}
            tone={seoOverview.missingSeoTitleCount === 0 ? "success" : "warning"}
          />
          <StatBox
            label="Missing Meta Descriptions"
            value={seoOverview.missingSeoDescCount}
            subtext={
              seoOverview.missingSeoDescCount === 0
                ? "All descriptions present"
                : "Needs Google snippet"
            }
            icon={AlertTriangle}
            tone={seoOverview.missingSeoDescCount === 0 ? "success" : "warning"}
          />
          <StatBox
            label="Structured Data"
            value={jsonLdSchema ? "Active" : "Disabled"}
            subtext="Product &amp; Organization JSON-LD"
            icon={CheckCircle2}
            tone={jsonLdSchema ? "success" : "neutral"}
          />
        </s-grid>
      </s-section>

      {/* Bulk Apply Notice if issues found */}
      {totalIssues > 0 && (
        <s-section heading="1-Click Automated SEO Fix">
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-stack direction="inline" justifycontent="space-between" alignitems="center">
              <s-stack direction="block" gap="none">
                <s-heading>Apply SEO Templates to Products Missing Custom Meta Tags</s-heading>
                <s-text tone="subdued">
                  Automatically populates optimized titles and descriptions for {seoOverview.missingSeoTitleCount} titles and {seoOverview.missingSeoDescCount} descriptions.
                </s-text>
              </s-stack>

              <s-button
                variant="primary"
                onClick={handleBulkApply}
                disabled={isSubmitting}
              >
                <Sparkles size={14} style={{ marginRight: "4px" }} />
                {isSubmitting ? "Applying..." : "Bulk Generate Meta Tags"}
              </s-button>
            </s-stack>
          </s-box>
        </s-section>
      )}

      {/* Search Engine Snippet Preview (SERP) */}
      <s-section heading="Google Search Result Preview">
        <s-paragraph>
          See how your product pages will appear to shoppers on Google search:
        </s-paragraph>

        <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
          <s-stack direction="block" gap="small-100">
            <s-stack direction="inline" gap="small-100" alignitems="center">
              <Globe size={16} color="#5c5f62" />
              <s-text tone="subdued">
                {storeUrl} &rsaquo; products &rsaquo; premium-snowboard-pro
              </s-text>
            </s-stack>

            <s-heading>{previewTitle || "Product Title Preview"}</s-heading>

            <s-paragraph>
              <s-text tone="subdued">
                {previewDescription || "Product description preview appears here..."}
              </s-text>
            </s-paragraph>

            {jsonLdSchema && (
              <s-stack direction="inline" gap="small-100" alignitems="center">
                <s-badge tone="success">In Stock</s-badge>
                <s-badge tone="info">$149.00 USD</s-badge>
                <s-badge tone="neutral">★★★★★ 4.9 (42 reviews)</s-badge>
              </s-stack>
            )}
          </s-stack>
        </s-box>
      </s-section>

      {/* Meta Tag Template Settings */}
      <s-section heading="Automated SEO Templates">
        <s-paragraph>
          Configure dynamic templates applied across your store catalog:
        </s-paragraph>

        <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
          <s-stack direction="block" gap="base">
            <s-text-field
              label="SEO Title Template"
              value={metaTitleTemplate}
              onInput={(e) => setMetaTitleTemplate(e.target.value)}
              details="Recommended length: 50–60 characters. Variables: {title}, {shop_name}"
            />

            <s-text-area
              label="SEO Meta Description Template"
              value={metaDescriptionTemplate}
              onInput={(e) => setMetaDescriptionTemplate(e.target.value)}
              details="Recommended length: 120–155 characters. Variables: {title}, {shop_name}"
            />

            <s-checkbox
              label="Enable JSON-LD Product &amp; Organization Schema Markup"
              checked={jsonLdSchema}
              onInput={(e) => setJsonLdSchema(e.target.checked)}
            />

            <s-stack direction="inline" justifycontent="flex-end">
              <s-button
                variant="primary"
                onClick={handleSave}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Saving..." : "Save SEO Settings"}
              </s-button>
            </s-stack>
          </s-stack>
        </s-box>
      </s-section>

      {/* Structured Data Snippet View */}
      <s-section heading="JSON-LD Structured Data Output">
        <s-stack direction="block" gap="base">
          <s-stack direction="inline" justifycontent="space-between" alignitems="center">
            <s-paragraph>
              Google-compliant JSON-LD structured data for search rich snippets:
            </s-paragraph>
            <s-button onClick={copyToClipboard} variant="tertiary">
              <Copy size={14} style={{ marginRight: "4px" }} />
              {copied ? "Copied" : "Copy Snippet"}
            </s-button>
          </s-stack>

          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-text>
              <pre style={{ margin: 0, fontFamily: "monospace", fontSize: "12px", whiteSpace: "pre-wrap" }}>
                {sampleJsonLd}
              </pre>
            </s-text>
          </s-box>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
