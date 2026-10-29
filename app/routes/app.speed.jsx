import { useState, useEffect } from "react";
import { useLoaderData, useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  FastForward,
  Cpu,
  Layers,
  Copy,
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

  return {
    settings: {
      instantPreloader: settings?.instantPreloader ?? true,
      lazyLoadImages: settings?.lazyLoadImages ?? true,
      deferNonCriticalScripts: settings?.deferNonCriticalScripts ?? false,
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

  try {
    await connectDB();
    await Settings.findOneAndUpdate(
      { shop },
      {
        instantPreloader,
        lazyLoadImages,
        deferNonCriticalScripts,
      },
      { upsert: true, new: true },
    );
    return { ok: true, message: "Speed Booster settings saved!" };
  } catch (e) {
    return { ok: false, error: e.message };
  }
};

export default function SpeedPage() {
  const { settings: initialSettings } = useLoaderData();
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
        instantPreloader: instantPreloader ? "true" : "false",
        lazyLoadImages: lazyLoadImages ? "true" : "false",
        deferNonCriticalScripts: deferNonCriticalScripts ? "true" : "false",
      },
      { method: "POST" },
    );
  };

  const boosterScript = `<!-- ZenSpeed Instant Preloader & Core Web Vitals Optimization -->
<script>
(function() {
  ${instantPreloader ? `// Instant Page Preload on Link Hover
  var preloaded = new Set();
  document.addEventListener('mouseover', function(e) {
    var a = e.target.closest('a');
    if (!a || !a.href || a.origin !== location.origin || preloaded.has(a.href)) return;
    if (a.href.indexOf('/cart') !== -1 || a.href.indexOf('/checkout') !== -1) return;
    var link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = a.href;
    document.head.appendChild(link);
    preloaded.add(a.href);
  }, { passive: true });` : ''}

  ${lazyLoadImages ? `// Auto-Apply Native Lazy Loading & Layout Shift Guard
  document.addEventListener('DOMContentLoaded', function() {
    var imgs = document.querySelectorAll('img:not([loading])');
    for (var i = 0; i < imgs.length; i++) {
      if (imgs[i].getBoundingClientRect().top > window.innerHeight) {
        imgs[i].setAttribute('loading', 'lazy');
      }
    }
  });` : ''}
})();
</script>`;

  const copyScript = () => {
    navigator.clipboard?.writeText(boosterScript);
    setCopied(true);
    shopify.toast?.show("Booster script copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <s-page heading="ZenSpeed: Store Speed Booster">
      {/* Feature Switches */}
      <s-section heading="Core Speed Optimizations">
        <s-paragraph>
          Activate automated acceleration mechanisms designed specifically for Shopify storefronts:
        </s-paragraph>

        <s-stack direction="block" gap="base">
          {/* Instant Preloader */}
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-stack direction="inline" justifycontent="space-between" alignitems="center">
              <s-stack direction="inline" gap="base" alignitems="center">
                <FastForward size={24} color="#008060" />
                <s-stack direction="block" gap="none">
                  <s-heading>Instant Page Preloader (Predictive Hover)</s-heading>
                  <s-text tone="subdued">
                    Pre-fetches product and collection pages when customers hover over links for near 0ms transitions.
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
                  <s-heading>Off-Screen Image Lazy Loading</s-heading>
                  <s-text tone="subdued">
                    Defers images outside the initial viewport until needed, optimizing Largest Contentful Paint (LCP).
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
                  <s-heading>Non-Critical Script Deferral (Experimental)</s-heading>
                  <s-text tone="subdued">
                    Delays non-critical third-party chat and analytics scripts to reduce Total Blocking Time (TBT).
                  </s-text>
                </s-stack>
              </s-stack>

              <s-checkbox
                checked={deferNonCriticalScripts}
                onInput={(e) => setDeferNonCriticalScripts(e.target.checked)}
              />
            </s-stack>
          </s-box>

          <s-button
            onClick={handleSave}
            {...(isSubmitting ? { loading: true } : {})}
          >
            Save Speed Booster Settings
          </s-button>
        </s-stack>
      </s-section>

      {/* Generated Script Snippet */}
      <s-section heading="Theme Speed Script Snippet">
        <s-stack direction="block" gap="base">
          <s-stack direction="inline" justifycontent="space-between" alignitems="center">
            <s-paragraph>
              Ultra-lightweight (&lt; 2KB) vanilla acceleration snippet:
            </s-paragraph>
            <s-button onClick={copyScript} variant="tertiary">
              <Copy size={14} style={{ marginRight: "4px" }} />
              {copied ? "Copied" : "Copy Script"}
            </s-button>
          </s-stack>

          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-text>
              <pre style={{ margin: 0, fontFamily: "monospace", fontSize: "12px", whiteSpace: "pre-wrap" }}>
                {boosterScript}
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
