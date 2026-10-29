import { useState, useEffect } from "react";
import { useLoaderData, useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  FastForward,
  Cpu,
  Layers,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { authenticate } from "../shopify.server";
import { connectDB } from "../db.server";
import Settings from "../models/settings.model";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop || "";

  let settings = null;
  try {
    await connectDB();
    settings = await Settings.findOne({ shop }).lean();
  } catch (e) {
    console.warn("Could not load settings:", e.message);
  }

  // Deep link to Shopify Theme Editor with App Embed context & ID
  const extensionUid = "65b30aae-2fc0-9b48-3e28-e6bf3e801b92f9c75ad7";
  const blockHandle = "zenspeed-booster";
  const themeEditorUrl = `https://${shop}/admin/themes/current/editor?context=apps&activateAppId=${extensionUid}/${blockHandle}`;

  return {
    shop,
    themeEditorUrl,
    settings: {
      instantPreloader: settings?.instantPreloader ?? true,
      lazyLoadImages: settings?.lazyLoadImages ?? true,
      deferNonCriticalScripts: settings?.deferNonCriticalScripts ?? false,
      jsonLdSchema: settings?.jsonLdSchema ?? true,
    },
  };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop || "";
  const formData = await request.formData();

  const instantPreloader = formData.get("instantPreloader") === "true";
  const lazyLoadImages = formData.get("lazyLoadImages") === "true";
  const deferNonCriticalScripts =
    formData.get("deferNonCriticalScripts") === "true";
  const jsonLdSchema = formData.get("jsonLdSchema") === "true";

  try {
    await connectDB();
    await Settings.findOneAndUpdate(
      { shop },
      {
        instantPreloader,
        lazyLoadImages,
        deferNonCriticalScripts,
        jsonLdSchema,
      },
      { upsert: true, new: true },
    );
    return { ok: true, message: "Speed Booster settings saved successfully!" };
  } catch (e) {
    return { ok: false, error: e.message };
  }
};

export default function SpeedPage() {
  const { shop, themeEditorUrl, settings: initialSettings } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();

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

  const isSubmitting = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.data?.message) {
      shopify.toast?.show(fetcher.data.message);
    }
  }, [fetcher.data, shopify]);

  const handleSave = () => {
    fetcher.submit(
      {
        instantPreloader: instantPreloader ? "true" : "false",
        lazyLoadImages: lazyLoadImages ? "true" : "false",
        deferNonCriticalScripts: deferNonCriticalScripts ? "true" : "false",
        jsonLdSchema: jsonLdSchema ? "true" : "false",
      },
      { method: "POST" },
    );
  };

  return (
    <s-page heading="ZenSpeed: Store Speed Booster">
      {/* Primary Action Button */}
      <s-button
        slot="primary-action"
        variant="primary"
        onClick={handleSave}
        disabled={isSubmitting}
      >
        {isSubmitting ? "Saving Changes..." : "Save Booster Settings"}
      </s-button>

      {/* Theme App Extension Activation Banner */}
      <s-section heading="Theme App Embed Status">
        <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
          <s-stack direction="block" gap="base">
            <s-stack direction="inline" justifycontent="space-between" alignitems="center">
              <s-stack direction="inline" gap="base" alignitems="center">
                <ShieldCheck size={28} color="#008060" />
                <s-stack direction="block" gap="none">
                  <s-heading>ZenSpeed Booster Theme App Extension</s-heading>
                  <s-text tone="subdued">
                    Zero theme code modifications &bull; Lightweight (&lt; 2KB) &bull; Safe &amp; 100% reversible
                  </s-text>
                </s-stack>
              </s-stack>

              <s-badge tone="success">
                <CheckCircle2 size={12} style={{ marginRight: "4px" }} />
                App Embed Ready
              </s-badge>
            </s-stack>

            <s-paragraph>
              To accelerate your storefront, activate the ZenSpeed App Embed in your Shopify Theme Editor. This injects modern Core Web Vitals optimizations without modifying your theme files.
            </s-paragraph>

            <s-stack direction="inline" gap="base" alignitems="center">
              <s-link href={themeEditorUrl} target="_blank">
                <s-button variant="primary">
                  <ExternalLink size={14} style={{ marginRight: "6px" }} />
                  Open Theme Editor &amp; Activate Embed
                </s-button>
              </s-link>
              <s-text tone="subdued">Opens current theme editor for {shop}</s-text>
            </s-stack>
          </s-stack>
        </s-box>
      </s-section>

      {/* Feature Switches */}
      <s-section heading="Core Speed Optimizations">
        <s-paragraph>
          Configure which acceleration techniques should run on your live storefront:
        </s-paragraph>

        <s-stack direction="block" gap="base">
          {/* Instant Preloader */}
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-stack direction="inline" justifycontent="space-between" alignitems="center">
              <s-stack direction="inline" gap="base" alignitems="center">
                <FastForward size={24} color="#008060" />
                <s-stack direction="block" gap="none">
                  <s-heading>Instant Page Preloader (Predictive Hover Prefetch)</s-heading>
                  <s-text tone="subdued">
                    Preloads product and collection pages when customers hover over links for near-instant 0ms navigation.
                  </s-text>
                </s-stack>
              </s-stack>

              <s-checkbox
                checked={instantPreloader}
                onInput={(e) => setInstantPreloader(e.target.checked)}
              />
            </s-stack>
          </s-box>

          {/* Native Lazy Loading */}
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-stack direction="inline" justifycontent="space-between" alignitems="center">
              <s-stack direction="inline" gap="base" alignitems="center">
                <Layers size={24} color="#008060" />
                <s-stack direction="block" gap="none">
                  <s-heading>Automated Off-Screen Image &amp; iFrame Lazy Loading</s-heading>
                  <s-text tone="subdued">
                    Prevents below-the-fold media from blocking Largest Contentful Paint (LCP) and Cumulative Layout Shift (CLS).
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
                    Defers heavy third-party scripts until browser reaches idle state to minimize Total Blocking Time (TBT).
                  </s-text>
                </s-stack>
              </s-stack>

              <s-checkbox
                checked={deferNonCriticalScripts}
                onInput={(e) => setDeferNonCriticalScripts(e.target.checked)}
              />
            </s-stack>
          </s-box>

          {/* JSON-LD Schema */}
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-stack direction="inline" justifycontent="space-between" alignitems="center">
              <s-stack direction="inline" gap="base" alignitems="center">
                <Sparkles size={24} color="#008060" />
                <s-stack direction="block" gap="none">
                  <s-heading>Automated JSON-LD Structured Data</s-heading>
                  <s-text tone="subdued">
                    Injects schema.org markup directly into the head for Google Rich Snippets, ratings, and pricing.
                  </s-text>
                </s-stack>
              </s-stack>

              <s-checkbox
                checked={jsonLdSchema}
                onInput={(e) => setJsonLdSchema(e.target.checked)}
              />
            </s-stack>
          </s-box>

          <s-stack direction="inline" justifycontent="flex-end">
            <s-button
              variant="primary"
              onClick={handleSave}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Saving..." : "Save Booster Settings"}
            </s-button>
          </s-stack>
        </s-stack>
      </s-section>

    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
