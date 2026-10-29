import { useState, useEffect } from "react";
import { useLoaderData, useFetcher, useSearchParams } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Search,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { authenticate } from "../shopify.server";
import {
  getStoreSeoOverview,
  updateProductImageAlts,
  bulkOptimizeStoreImages,
  revertImageAlt,
  revertAllImageAlts,
} from "../services/seo.server";
import { connectDB } from "../db.server";
import Settings from "../models/settings.model";
import ImageBackup from "../models/imageBackup.model";
import StatBox from "../components/StatBox";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop || "";
  const url = new URL(request.url);
  const scanLimit = parseInt(url.searchParams.get("limit") || "250", 10);

  let settings = null;
  let recentBackups = [];
  let totalBackupsCount = 0;

  try {
    await connectDB();
    settings = await Settings.findOne({ shop }).lean();
    recentBackups = await ImageBackup.find({ shop, reverted: false })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    totalBackupsCount = await ImageBackup.countDocuments({ shop, reverted: false });
  } catch (e) {
    console.warn("Could not load settings or backups:", e.message);
  }

  const overview = await getStoreSeoOverview(admin, { maxProducts: scanLimit });

  return {
    shop,
    overview,
    scanLimit,
    template: settings?.altTextTemplate || "{product_title} - {shop_name}",
    recentBackups: JSON.parse(JSON.stringify(recentBackups)),
    totalBackupsCount,
  };
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop || "";
  const formData = await request.formData();
  const intent = formData.get("intent");
  const template = formData.get("template") || "{product_title} - {shop_name}";

  if (intent === "save_template") {
    try {
      await connectDB();
      await Settings.findOneAndUpdate(
        { shop },
        { altTextTemplate: template.toString() },
        { upsert: true, new: true },
      );
      return { ok: true, message: "Template updated successfully!" };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  if (intent === "optimize_product") {
    const productId = formData.get("productId")?.toString() || "";
    const productTitle = formData.get("productTitle")?.toString() || "";
    const shopName = formData.get("shopName")?.toString() || "Store";

    try {
      const result = await updateProductImageAlts({
        admin,
        shop,
        productId,
        productTitle,
        shopName,
        template: template.toString(),
      });

      return {
        ok: true,
        message: `Updated & backed up alt text for ${result.updated} images!`,
        result,
      };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  if (intent === "bulk_optimize_all") {
    const shopName = formData.get("shopName")?.toString() || "Store";
    const maxProducts = parseInt(formData.get("maxProducts")?.toString() || "100", 10);

    try {
      const result = await bulkOptimizeStoreImages({
        admin,
        shop,
        shopName,
        template: template.toString(),
        maxProducts,
      });

      return {
        ok: true,
        message: `Bulk optimization completed! Updated ${result.totalOptimized} images with safe backups.`,
      };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  if (intent === "revert_single") {
    const backupId = formData.get("backupId")?.toString() || "";
    try {
      await revertImageAlt({ admin, shop, backupId });
      return { ok: true, message: "Restored original image alt text!" };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  if (intent === "revert_all") {
    try {
      const result = await revertAllImageAlts({ admin, shop });
      return {
        ok: true,
        message: `Successfully restored ${result.revertedCount} images back to original state!`,
      };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  return { ok: false, error: "Invalid intent" };
};

export default function ImageSeoPage() {
  const {
    overview,
    scanLimit,
    template: initialTemplate,
    recentBackups,
    totalBackupsCount,
  } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const [, setSearchParams] = useSearchParams();

  const [template, setTemplate] = useState(initialTemplate);
  const [filterMissingOnly, setFilterMissingOnly] = useState(true);

  const isSubmitting = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.data?.message) {
      shopify.toast?.show(fetcher.data.message);
    } else if (fetcher.data?.error) {
      shopify.toast?.show(`Error: ${fetcher.data.error}`);
    }
  }, [fetcher.data, shopify]);

  const handleSaveTemplate = () => {
    fetcher.submit(
      { intent: "save_template", template },
      { method: "POST" },
    );
  };

  const handleOptimizeProduct = (productId, productTitle) => {
    fetcher.submit(
      {
        intent: "optimize_product",
        productId,
        productTitle,
        shopName: overview.shopName,
        template,
      },
      { method: "POST" },
    );
  };

  const handleBulkOptimizeAll = () => {
    fetcher.submit(
      {
        intent: "bulk_optimize_all",
        shopName: overview.shopName,
        template,
        maxProducts: scanLimit.toString(),
      },
      { method: "POST" },
    );
  };

  const handleRevertSingle = (backupId) => {
    fetcher.submit(
      { intent: "revert_single", backupId },
      { method: "POST" },
    );
  };

  const handleRevertAll = () => {
    if (confirm("Are you sure you want to revert all optimized image alt texts back to their original state?")) {
      fetcher.submit({ intent: "revert_all" }, { method: "POST" });
    }
  };

  const handleLimitChange = (e) => {
    const newLimit = e.target.value;
    setSearchParams((prev) => {
      prev.set("limit", newLimit);
      return prev;
    });
  };

  const displayedProducts = filterMissingOnly
    ? overview.products.filter((p) => p.missingAltImages.length > 0)
    : overview.products;

  return (
    <s-page heading="Image Alt-Text Optimizer &amp; Backup">
      {/* Primary Action Button */}
      {overview.missingAltCount > 0 && (
        <s-button
          slot="primary-action"
          variant="primary"
          onClick={handleBulkOptimizeAll}
          disabled={isSubmitting}
        >
          <Sparkles size={14} style={{ marginRight: "4px" }} />
          {isSubmitting ? "Optimizing Catalog..." : `1-Click Optimize All (${overview.missingAltCount})`}
        </s-button>
      )}

      {/* Top Overview Cards */}
      <s-section>
        <s-grid gridtemplatecolumns="repeat(auto-fit, minmax(200px, 1fr))" gap="base">
          <StatBox
            label="Total Products in Store"
            value={overview.totalInStore}
            subtext={`${overview.totalProducts} scanned in batch`}
            icon={Search}
            tone="neutral"
          />
          <StatBox
            label="Total Images Scanned"
            value={overview.totalImages}
            icon={ImageIcon}
            tone="info"
          />
          <StatBox
            label="Images Missing Alt Text"
            value={overview.missingAltCount}
            subtext={
              overview.missingAltCount === 0
                ? "All images optimized!"
                : "Requires optimization"
            }
            icon={AlertCircle}
            tone={overview.missingAltCount === 0 ? "success" : "warning"}
          />
          <StatBox
            label="Safety &amp; Backups"
            value={`${totalBackupsCount} Backed Up`}
            subtext="Reversible at any time"
            icon={ShieldCheck}
            tone="success"
          />
        </s-grid>
      </s-section>

      {/* Template Setting Card */}
      <s-section heading="Alt-Text Generation Template">
        <s-paragraph>
          Google uses image alt text to index visual content. Define your automated alt-text pattern:
        </s-paragraph>

        <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
          <s-stack direction="block" gap="base">
            <s-stack direction="inline" gap="base" alignitems="flex-end">
              <s-box inlinesize="100%">
                <s-text-field
                  label="Template Pattern"
                  value={template}
                  onInput={(e) => setTemplate(e.target.value)}
                  placeholder="{product_title} - {shop_name}"
                />
              </s-box>

              <s-button
                variant="primary"
                onClick={handleSaveTemplate}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Saving..." : "Save Template"}
              </s-button>
            </s-stack>

            <s-stack direction="inline" gap="small-100" alignitems="center">
              <s-text tone="subdued">Insert variables:</s-text>
              <s-button-group>
                <s-button
                  variant="tertiary"
                  onClick={() => setTemplate((prev) => `${prev} {product_title}`.trim())}
                >
                  + {`{product_title}`}
                </s-button>
                <s-button
                  variant="tertiary"
                  onClick={() => setTemplate((prev) => `${prev} {shop_name}`.trim())}
                >
                  + {`{shop_name}`}
                </s-button>
                <s-button
                  variant="tertiary"
                  onClick={() => setTemplate((prev) => `${prev} {index}`.trim())}
                >
                  + {`{index}`}
                </s-button>
              </s-button-group>
            </s-stack>
          </s-stack>
        </s-box>
      </s-section>

      {/* Product List with Filter & Scan Size Selector */}
      <s-section heading="Product Image Catalog">
        <s-stack direction="inline" justifycontent="space-between" alignitems="center">
          <s-stack direction="inline" gap="small-100" alignitems="center">
            <s-select
              label="Scan Batch Size"
              value={scanLimit.toString()}
              onInput={handleLimitChange}
            >
              <s-option value="50">50 products</s-option>
              <s-option value="100">100 products</s-option>
              <s-option value="250">250 products (Recommended)</s-option>
              <s-option value="500">500 products</s-option>
            </s-select>
          </s-stack>

          <s-checkbox
            label={`Show only products with missing alt text (${overview.missingAltCount} images)`}
            checked={filterMissingOnly}
            onInput={(e) => setFilterMissingOnly(e.target.checked)}
          />
        </s-stack>

        {displayedProducts.length === 0 ? (
          <s-box padding="loose" background="subdued" borderWidth="base" borderRadius="base">
            <s-stack direction="block" alignitems="center" gap="base">
              <CheckCircle2 size={32} color="#008060" />
              <s-heading>All Scanned Products Have Alt Text!</s-heading>
              <s-paragraph>
                <s-text tone="subdued">
                  Every image in this scanned batch has descriptive alt text configured for Google Image Search.
                </s-text>
              </s-paragraph>
            </s-stack>
          </s-box>
        ) : (
          <s-stack direction="block" gap="small-100">
            {displayedProducts.map((product) => {
              const hasMissing = product.missingAltImages.length > 0;
              const firstImage = product.images[0]?.image?.url;

              return (
                <s-box
                  key={product.id}
                  padding="base"
                  borderWidth="base"
                  borderRadius="base"
                  background="subdued"
                >
                  <s-stack direction="inline" justifycontent="space-between" alignitems="center">
                    <s-stack direction="inline" gap="base" alignitems="center">
                      {firstImage ? (
                        <s-thumbnail src={firstImage} alt={product.title} size="small" />
                      ) : (
                        <s-box padding="small-100" background="subdued" borderRadius="base">
                          <ImageIcon size={20} color="#8c9196" />
                        </s-box>
                      )}

                      <s-stack direction="block" gap="none">
                        <s-heading>{product.title}</s-heading>
                        <s-text tone="subdued">
                          {product.totalImages} images total &bull;{" "}
                          {product.missingAltImages.length} missing alt tags
                        </s-text>
                      </s-stack>
                    </s-stack>

                    {hasMissing ? (
                      <s-button
                        variant="primary"
                        onClick={() => handleOptimizeProduct(product.id, product.title)}
                        disabled={isSubmitting}
                      >
                        <Sparkles size={14} style={{ marginRight: "4px" }} />
                        {isSubmitting ? "Optimizing..." : `Optimize (${product.missingAltImages.length}) Images`}
                      </s-button>
                    ) : (
                      <s-badge tone="success">
                        <CheckCircle2 size={12} style={{ marginRight: "4px" }} />
                        Optimized
                      </s-badge>
                    )}
                  </s-stack>
                </s-box>
              );
            })}
          </s-stack>
        )}
      </s-section>

      {/* Backup & One-Click Restore Section (PRD Section 6 MVP) */}
      {recentBackups && recentBackups.length > 0 && (
        <s-section heading="Backup &amp; One-Click Restore (Safety Guarantee)">
          <s-paragraph>
            ZenSpeed automatically backs up original alt text in MongoDB before applying changes. You can restore any image or all images back to their original state at any time.
          </s-paragraph>

          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-stack direction="block" gap="base">
              <s-stack direction="inline" justifycontent="space-between" alignitems="center">
                <s-stack direction="inline" gap="small-100" alignitems="center">
                  <ShieldCheck size={20} color="#008060" />
                  <s-heading>Active Original Backups ({totalBackupsCount})</s-heading>
                </s-stack>

                <s-button
                  variant="tertiary"
                  onClick={handleRevertAll}
                  disabled={isSubmitting}
                >
                  <RotateCcw size={14} style={{ marginRight: "4px" }} />
                  Restore All Originals
                </s-button>
              </s-stack>

              <s-stack direction="block" gap="small-100">
                {recentBackups.map((backup) => (
                  <s-box
                    key={backup._id}
                    padding="small-100"
                    borderWidth="base"
                    borderRadius="base"
                    background="subdued"
                  >
                    <s-stack direction="inline" justifycontent="space-between" alignitems="center">
                      <s-stack direction="inline" gap="base" alignitems="center">
                        {backup.imageUrl ? (
                          <s-thumbnail src={backup.imageUrl} alt={backup.productTitle} size="small" />
                        ) : (
                          <ImageIcon size={18} color="#8c9196" />
                        )}
                        <s-stack direction="block" gap="none">
                          <s-heading>{backup.productTitle || "Product Image"}</s-heading>
                          <s-text tone="subdued">
                            Original: <em>{backup.originalAlt ? `"${backup.originalAlt}"` : "(empty)"}</em> &rarr; Optimized: <strong>&quot;{backup.optimizedAlt}&quot;</strong>
                          </s-text>
                        </s-stack>
                      </s-stack>

                      <s-button
                        variant="tertiary"
                        onClick={() => handleRevertSingle(backup._id)}
                        disabled={isSubmitting}
                      >
                        <RotateCcw size={12} style={{ marginRight: "4px" }} />
                        Revert
                      </s-button>
                    </s-stack>
                  </s-box>
                ))}
              </s-stack>
            </s-stack>
          </s-box>
        </s-section>
      )}
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
