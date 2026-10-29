import { useState, useEffect } from "react";
import { useLoaderData, useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  Trash2,
  Zap,
  ShieldCheck,
  FastForward,
  Layers,
  Cpu,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import { authenticate } from "../shopify.server";
import { connectDB } from "../db.server";
import Audit, { getStoreAuditModel } from "../models/audit.model";
import Settings from "../models/settings.model";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop || "";

  let auditCount = 0;
  let settings = null;

  try {
    await connectDB();
    const StoreAudit = getStoreAuditModel(shop);
    auditCount = await StoreAudit.countDocuments();
    settings = await Settings.findOne({ shop }).lean();
  } catch (e) {
    console.warn("Could not load settings:", e.message);
  }

  return {
    shop,
    auditCount,
    settings: {
      boosterEnabled: settings?.boosterEnabled ?? true,
      instantPreloader: settings?.instantPreloader ?? true,
      lazyLoadImages: settings?.lazyLoadImages ?? true,
      deferNonCriticalScripts: settings?.deferNonCriticalScripts ?? false,
      jsonLdSchema: settings?.jsonLdSchema ?? true,
      autoAltText: settings?.autoAltText ?? true,
    },
  };
};

export const action = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop || "";
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "save_settings") {
    const boosterEnabled = formData.get("boosterEnabled") === "true";
    const instantPreloader = formData.get("instantPreloader") === "true";
    const lazyLoadImages = formData.get("lazyLoadImages") === "true";
    const deferNonCriticalScripts =
      formData.get("deferNonCriticalScripts") === "true";
    const jsonLdSchema = formData.get("jsonLdSchema") === "true";
    const autoAltText = formData.get("autoAltText") === "true";

    try {
      await connectDB();
      await Settings.findOneAndUpdate(
        { shop },
        {
          boosterEnabled,
          instantPreloader,
          lazyLoadImages,
          deferNonCriticalScripts,
          jsonLdSchema,
          autoAltText,
        },
        { upsert: true, new: true },
      );

      // Sync settings to Shopify Shop Metafield for Theme Extension
      try {
        const shopRes = await admin.graphql(
          `#graphql
          query getShopId {
            shop {
              id
            }
          }`,
        );
        const shopJson = await shopRes.json();
        const shopId = shopJson.data?.shop?.id;

        if (shopId) {
          await admin.graphql(
            `#graphql
            mutation setShopSettings($metafields: [MetafieldsSetInput!]!) {
              metafieldsSet(metafields: $metafields) {
                metafields {
                  id
                  key
                }
                userErrors {
                  field
                  message
                }
              }
            }`,
            {
              variables: {
                metafields: [
                  {
                    ownerId: shopId,
                    namespace: "zenspeed",
                    key: "settings",
                    type: "json",
                    value: JSON.stringify({
                      boosterEnabled,
                      instantPreloader,
                      lazyLoadImages,
                      deferScripts: deferNonCriticalScripts,
                      jsonLd: jsonLdSchema,
                    }),
                  },
                ],
              },
            },
          );
        }
      } catch (metaErr) {
        console.warn("Could not sync metafield to Shopify:", metaErr.message);
      }

      return { ok: true, message: "Settings saved and synced to storefront!" };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  if (intent === "clear_audits") {
    try {
      await connectDB();
      const StoreAudit = getStoreAuditModel(shop);
      const res = await StoreAudit.deleteMany({});
      await Audit.deleteMany({ shop });
      return {
        ok: true,
        message: `Cleared ${res.deletedCount} audit records from MongoDB.`,
      };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  return { ok: false, error: "Invalid intent" };
};

export default function SettingsPage() {
  const { auditCount, settings: initialSettings } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();

  const [boosterEnabled, setBoosterEnabled] = useState(
    initialSettings.boosterEnabled,
  );
  const [instantPreloader, setInstantPreloader] = useState(
    initialSettings.instantPreloader,
  );
  const [lazyLoadImages, setLazyLoadImages] = useState(
    initialSettings.lazyLoadImages,
  );
  const [deferNonCriticalScripts, setDeferNonCriticalScripts] = useState(
    initialSettings.deferNonCriticalScripts,
  );
  const [jsonLdSchema, setJsonLdSchema] = useState(
    initialSettings.jsonLdSchema,
  );
  const [autoAltText, setAutoAltText] = useState(
    initialSettings.autoAltText,
  );

  const isSubmitting = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.data?.message) {
      shopify.toast?.show(fetcher.data.message);
    } else if (fetcher.data?.error) {
      shopify.toast?.show(`Error: ${fetcher.data.error}`);
    }
  }, [fetcher.data, shopify]);

  const handleSaveAll = () => {
    fetcher.submit(
      {
        intent: "save_settings",
        boosterEnabled: boosterEnabled ? "true" : "false",
        instantPreloader: instantPreloader ? "true" : "false",
        lazyLoadImages: lazyLoadImages ? "true" : "false",
        deferNonCriticalScripts: deferNonCriticalScripts ? "true" : "false",
        jsonLdSchema: jsonLdSchema ? "true" : "false",
        autoAltText: autoAltText ? "true" : "false",
      },
      { method: "POST" },
    );
  };

  const handleClearAudits = () => {
    if (
      confirm(
        "Are you sure you want to clear your stored audit history in MongoDB?",
      )
    ) {
      fetcher.submit({ intent: "clear_audits" }, { method: "POST" });
    }
  };

  return (
    <s-page heading="ZenSpeed: Settings">
      {/* Primary Action Button */}
      <s-button
        slot="primary-action"
        variant="primary"
        onClick={handleSaveAll}
        disabled={isSubmitting}
      >
        {isSubmitting ? "Saving Changes..." : "Save Settings"}
      </s-button>

      {/* ZenSpeed Booster Controls Section */}
      <s-section heading="ZenSpeed Booster Controls">
        <s-paragraph>
          Configure and toggle all storefront speed enhancements directly from your app settings:
        </s-paragraph>

        <s-stack direction="block" gap="base">
          {/* Master Booster Switch */}
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-stack direction="inline" justifycontent="space-between" alignitems="center">
              <s-stack direction="inline" gap="base" alignitems="center">
                <Zap size={24} color="#008060" />
                <s-stack direction="block" gap="none">
                  <s-heading>ZenSpeed Booster (Master Switch)</s-heading>
                  <s-text tone="subdued">
                    Master toggle for all storefront speed &amp; SEO app embed optimizations.
                  </s-text>
                </s-stack>
              </s-stack>

              <s-stack direction="inline" gap="small-100" alignitems="center">
                <s-badge tone={boosterEnabled ? "success" : "neutral"}>
                  <CheckCircle2 size={12} style={{ marginRight: "4px" }} />
                  {boosterEnabled ? "Enabled" : "Disabled"}
                </s-badge>
                <s-checkbox
                  checked={boosterEnabled}
                  onInput={(e) => setBoosterEnabled(e.target.checked)}
                />
              </s-stack>
            </s-stack>
          </s-box>

          {/* Instant Preloader */}
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-stack direction="inline" justifycontent="space-between" alignitems="center">
              <s-stack direction="inline" gap="base" alignitems="center">
                <FastForward size={24} color="#008060" />
                <s-stack direction="block" gap="none">
                  <s-heading>Instant Page Preloader (Hover Prefetch)</s-heading>
                  <s-text tone="subdued">
                    Preloads product pages when customers hover over links for near-instant navigation.
                  </s-text>
                </s-stack>
              </s-stack>

              <s-checkbox
                checked={instantPreloader}
                onInput={(e) => setInstantPreloader(e.target.checked)}
              />
            </s-stack>
          </s-box>

          {/* Lazy Loading */}
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-stack direction="inline" justifycontent="space-between" alignitems="center">
              <s-stack direction="inline" gap="base" alignitems="center">
                <Layers size={24} color="#008060" />
                <s-stack direction="block" gap="none">
                  <s-heading>Image &amp; iFrame Lazy Loading</s-heading>
                  <s-text tone="subdued">
                    Prevents below-the-fold images from blocking initial Largest Contentful Paint (LCP).
                  </s-text>
                </s-stack>
              </s-stack>

              <s-checkbox
                checked={lazyLoadImages}
                onInput={(e) => setLazyLoadImages(e.target.checked)}
              />
            </s-stack>
          </s-box>

          {/* Script Deferral */}
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-stack direction="inline" justifycontent="space-between" alignitems="center">
              <s-stack direction="inline" gap="base" alignitems="center">
                <Cpu size={24} color="#b95000" />
                <s-stack direction="block" gap="none">
                  <s-heading>Non-Critical Script Deferral</s-heading>
                  <s-text tone="subdued">
                    Delays heavy background scripts to reduce Total Blocking Time (TBT).
                  </s-text>
                </s-stack>
              </s-stack>

              <s-checkbox
                checked={deferNonCriticalScripts}
                onInput={(e) => setDeferNonCriticalScripts(e.target.checked)}
              />
            </s-stack>
          </s-box>

          {/* JSON-LD Structured Data */}
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-stack direction="inline" justifycontent="space-between" alignitems="center">
              <s-stack direction="inline" gap="base" alignitems="center">
                <Sparkles size={24} color="#008060" />
                <s-stack direction="block" gap="none">
                  <s-heading>JSON-LD Structured Data</s-heading>
                  <s-text tone="subdued">
                    Generates Google rich snippets for products, pricing, and store ratings.
                  </s-text>
                </s-stack>
              </s-stack>

              <s-checkbox
                checked={jsonLdSchema}
                onInput={(e) => setJsonLdSchema(e.target.checked)}
              />
            </s-stack>
          </s-box>

          {/* Auto-Optimize Uploads */}
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-stack direction="inline" justifycontent="space-between" alignitems="center">
              <s-stack direction="inline" gap="base" alignitems="center">
                <Zap size={24} color="#008060" />
                <s-stack direction="block" gap="none">
                  <s-heading>Auto-Optimize Newly Uploaded Product Images</s-heading>
                  <s-text tone="subdued">
                    Automatically scans newly created or updated products via webhook and sets descriptive alt text.
                  </s-text>
                </s-stack>
              </s-stack>

              <s-checkbox
                checked={autoAltText}
                onInput={(e) => setAutoAltText(e.target.checked)}
              />
            </s-stack>
          </s-box>

          <s-stack direction="inline" justifycontent="flex-end">
            <s-button
              variant="primary"
              onClick={handleSaveAll}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Saving..." : "Save Settings"}
            </s-button>
          </s-stack>
        </s-stack>
      </s-section>

      {/* Data Management & Cleanup */}
      <s-section heading="Data Storage Management">
        <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
          <s-stack direction="inline" justifycontent="space-between" alignitems="center">
            <s-stack direction="block" gap="none">
              <s-heading>Audit History Cleanup</s-heading>
              <s-text tone="subdued">
                Clears all stored historical Lighthouse audit records from MongoDB Atlas. This does not affect store images or settings.
              </s-text>
            </s-stack>

            <s-button
              variant="tertiary"
              tone="critical"
              onClick={handleClearAudits}
              disabled={isSubmitting || auditCount === 0}
            >
              <Trash2 size={14} style={{ marginRight: "4px" }} />
              Clear {auditCount} Audits
            </s-button>
          </s-stack>
        </s-box>
      </s-section>

      {/* Safety & Compliance */}
      <s-section heading="Theme App Extension &amp; Safety">
        <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
          <s-stack direction="inline" gap="small-100" alignitems="center">
            <ShieldCheck size={20} color="#008060" />
            <s-stack direction="block" gap="none">
              <s-heading>Safe Extension Architecture</s-heading>
              <s-text tone="subdued">
                ZenSpeed operates purely via Theme App Extension app embeds and GraphQL Admin APIs. Zero permanent liquid code is injected into your theme assets.
              </s-text>
            </s-stack>
          </s-stack>
        </s-box>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
