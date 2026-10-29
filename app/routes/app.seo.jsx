import { useState, useEffect } from "react";
import { useLoaderData, useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  Globe,
  Copy,
} from "lucide-react";
import { authenticate } from "../shopify.server";
import { connectDB } from "../db.server";
import Settings from "../models/settings.model";

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

  // Fetch shop details for preview
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

  return {
    shopName: shopData.name || "My Store",
    storeUrl: shopData.primaryDomain?.url || `https://${shop}`,
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
  const { session } = await authenticate.admin(request);
  const shop = session.shop || "";
  const formData = await request.formData();

  const metaTitleTemplate =
    formData.get("metaTitleTemplate")?.toString() || "{title} | {shop_name}";
  const metaDescriptionTemplate =
    formData.get("metaDescriptionTemplate")?.toString() || "";
  const jsonLdSchema = formData.get("jsonLdSchema") === "true";

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
    return { ok: true, message: "SEO & Schema settings saved!" };
  } catch (e) {
    return { ok: false, error: e.message };
  }
};

export default function SeoPage() {
  const { shopName, storeUrl, settings: initialSettings } = useLoaderData();
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
    }
  }, [fetcher.data, shopify]);

  const handleSave = () => {
    fetcher.submit(
      {
        metaTitleTemplate,
        metaDescriptionTemplate,
        jsonLdSchema: jsonLdSchema ? "true" : "false",
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

  return (
    <s-page heading="SEO &amp; Structured Data (JSON-LD)">
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

            <s-button
              onClick={handleSave}
              {...(isSubmitting ? { loading: true } : {})}
            >
              Save SEO Settings
            </s-button>
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
