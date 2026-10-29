import { useState, useEffect } from "react";
import { useLoaderData, useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { Database, Key, Trash2, Zap, ShieldCheck } from "lucide-react";
import { authenticate } from "../shopify.server";
import { connectDB } from "../db.server";
import Audit from "../models/audit.model";
import Settings from "../models/settings.model";
import ImageBackup from "../models/imageBackup.model";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop || "";

  let auditCount = 0;
  let backupCount = 0;
  let dbStatus = "Connected";
  let autoAltText = true;

  try {
    await connectDB();
    auditCount = await Audit.countDocuments({ shop });
    backupCount = await ImageBackup.countDocuments({ shop, reverted: false });
    const settings = await Settings.findOne({ shop }).lean();
    if (settings) {
      autoAltText = settings.autoAltText ?? true;
    }
  } catch (e) {
    dbStatus = `Error: ${e.message}`;
  }

  // eslint-disable-next-line no-undef
  const hasApiKey = Boolean(process.env.PAGESPEED_INSIGHT_KEY);

  return {
    shop,
    auditCount,
    backupCount,
    dbStatus,
    hasApiKey,
    autoAltText,
    // eslint-disable-next-line no-undef
    dbName: process.env.MONGODB_DB_NAME || "Zenspeed",
  };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop || "";
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "save_automation") {
    const autoAltText = formData.get("autoAltText") === "true";
    try {
      await connectDB();
      await Settings.findOneAndUpdate(
        { shop },
        { autoAltText },
        { upsert: true, new: true },
      );
      return { ok: true, message: "Automation settings updated!" };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  if (intent === "clear_audits") {
    try {
      await connectDB();
      const res = await Audit.deleteMany({ shop });
      return { ok: true, message: `Cleared ${res.deletedCount} audit records from MongoDB.` };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  return { ok: false, error: "Invalid intent" };
};

export default function SettingsPage() {
  const { shop, auditCount, backupCount, dbStatus, hasApiKey, dbName, autoAltText: initialAutoAltText } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();

  const [autoAltText, setAutoAltText] = useState(initialAutoAltText);
  const isSubmitting = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.data?.message) {
      shopify.toast?.show(fetcher.data.message);
    } else if (fetcher.data?.error) {
      shopify.toast?.show(`Error: ${fetcher.data.error}`);
    }
  }, [fetcher.data, shopify]);

  const handleSaveAutomation = () => {
    fetcher.submit(
      {
        intent: "save_automation",
        autoAltText: autoAltText ? "true" : "false",
      },
      { method: "POST" },
    );
  };

  const handleClearAudits = () => {
    if (confirm("Are you sure you want to clear your stored audit history in MongoDB?")) {
      fetcher.submit({ intent: "clear_audits" }, { method: "POST" });
    }
  };

  return (
    <s-page heading="ZenSpeed: System Settings">
      {/* Service Health Cards */}
      <s-section heading="Service &amp; Integration Health">
        <s-grid gridtemplatecolumns="repeat(auto-fit, minmax(280px, 1fr))" gap="base">
          {/* MongoDB Card */}
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-stack direction="block" gap="small-100">
              <s-stack direction="inline" justifycontent="space-between" alignitems="center">
                <s-stack direction="inline" gap="small-100" alignitems="center">
                  <Database size={18} color="#008060" />
                  <s-heading>MongoDB Atlas</s-heading>
                </s-stack>
                <s-badge tone="success">Online</s-badge>
              </s-stack>

              <s-stack direction="block" gap="none">
                <s-text tone="subdued">Database: {dbName}</s-text>
                <s-text tone="subdued">Connection: {dbStatus}</s-text>
                <s-text tone="subdued">Stored Audits: {auditCount} records</s-text>
                <s-text tone="subdued">Active Backups: {backupCount} images</s-text>
              </s-stack>
            </s-stack>
          </s-box>

          {/* PageSpeed API Card */}
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-stack direction="block" gap="small-100">
              <s-stack direction="inline" justifycontent="space-between" alignitems="center">
                <s-stack direction="inline" gap="small-100" alignitems="center">
                  <Key size={18} color={hasApiKey ? "#008060" : "#d82c0d"} />
                  <s-heading>Google PageSpeed API</s-heading>
                </s-stack>
                <s-badge tone={hasApiKey ? "success" : "critical"}>
                  {hasApiKey ? "Key Detected" : "Missing API Key"}
                </s-badge>
              </s-stack>

              <s-stack direction="block" gap="none">
                <s-text tone="subdued">Target Store: {shop}</s-text>
                <s-text tone="subdued">Engine: Google Lighthouse v12 / v5 API</s-text>
                <s-text tone="subdued">Quota: {hasApiKey ? "25,000 req/day" : "Rate-limited"}</s-text>
              </s-stack>
            </s-stack>
          </s-box>
        </s-grid>
      </s-section>

      {/* Background Automation (PRD Section 6 V1.1) */}
      <s-section heading="Catalog Automation &amp; Webhooks">
        <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
          <s-stack direction="block" gap="base">
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

            <s-stack direction="inline" justifycontent="flex-end">
              <s-button
                variant="primary"
                onClick={handleSaveAutomation}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Saving..." : "Save Automation"}
              </s-button>
            </s-stack>
          </s-stack>
        </s-box>
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
