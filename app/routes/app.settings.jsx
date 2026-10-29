import { useEffect } from "react";
import { useLoaderData, useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { Database, Key, Trash2 } from "lucide-react";
import { authenticate } from "../shopify.server";
import { connectDB } from "../db.server";
import Audit from "../models/audit.model";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop || "";

  let auditCount = 0;
  let dbStatus = "Connected";
  try {
    await connectDB();
    auditCount = await Audit.countDocuments({ shop });
  } catch (e) {
    dbStatus = `Error: ${e.message}`;
  }

  // eslint-disable-next-line no-undef
  const hasApiKey = Boolean(process.env.PAGESPEED_INSIGHT_KEY);

  return {
    shop,
    auditCount,
    dbStatus,
    hasApiKey,
    // eslint-disable-next-line no-undef
    dbName: process.env.MONGODB_DB_NAME || "Zenspeed",
  };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop || "";
  const formData = await request.formData();
  const intent = formData.get("intent");

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
  const { shop, auditCount, dbStatus, hasApiKey, dbName } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();

  const isSubmitting = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.data?.message) {
      shopify.toast?.show(fetcher.data.message);
    } else if (fetcher.data?.error) {
      shopify.toast?.show(`Error: ${fetcher.data.error}`);
    }
  }, [fetcher.data, shopify]);

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
                <s-text tone="subdued">Status: {dbStatus}</s-text>
                <s-text tone="subdued">Stored Audits: {auditCount} records</s-text>
              </s-stack>
            </s-stack>
          </s-box>

          {/* PageSpeed API Card */}
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-stack direction="block" gap="small-100">
              <s-stack direction="inline" justifycontent="space-between" alignitems="center">
                <s-stack direction="inline" gap="small-100" alignitems="center">
                  <Key size={18} color={hasApiKey ? "#008060" : "#b95000"} />
                  <s-heading>PageSpeed Insights API</s-heading>
                </s-stack>
                <s-badge tone={hasApiKey ? "success" : "warning"}>
                  {hasApiKey ? "Connected" : "Missing Key"}
                </s-badge>
              </s-stack>

              <s-stack direction="block" gap="none">
                <s-text tone="subdued">API Version: v5 (Lighthouse Engine)</s-text>
                <s-text tone="subdued">Key source: PAGESPEED_INSIGHT_KEY in .env</s-text>
              </s-stack>
            </s-stack>
          </s-box>
        </s-grid>
      </s-section>

      {/* Database Maintenance */}
      <s-section heading="MongoDB Data Management">
        <s-paragraph>
          Manage stored historical audits and reports saved in your MongoDB cluster:
        </s-paragraph>

        <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
          <s-stack direction="inline" justifycontent="space-between" alignitems="center">
            <s-stack direction="block" gap="none">
              <s-heading>Clear Audit History</s-heading>
              <s-text tone="subdued">
                Currently storing {auditCount} audit reports for store {shop}.
              </s-text>
            </s-stack>

            <s-button
              onClick={handleClearAudits}
              tone="critical"
              {...(isSubmitting ? { loading: true } : {})}
            >
              <Trash2 size={14} style={{ marginRight: "4px" }} />
              Clear All Audits
            </s-button>
          </s-stack>
        </s-box>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
