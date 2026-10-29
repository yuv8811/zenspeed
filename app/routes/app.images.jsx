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
} from "lucide-react";
import { authenticate } from "../shopify.server";
import { getStoreSeoOverview, updateProductImageAlts } from "../services/seo.server";
import { connectDB } from "../db.server";
import Settings from "../models/settings.model";
import StatBox from "../components/StatBox";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop || "";
  const url = new URL(request.url);
  const scanLimit = parseInt(url.searchParams.get("limit") || "250", 10);

  let settings = null;
  try {
    await connectDB();
    settings = await Settings.findOne({ shop }).lean();
  } catch (e) {
    console.warn("Could not load settings:", e.message);
  }

  const overview = await getStoreSeoOverview(admin, { maxProducts: scanLimit });

  return {
    overview,
    scanLimit,
    template: settings?.altTextTemplate || "{product_title} - {shop_name}",
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
        productId,
        productTitle,
        shopName,
        template: template.toString(),
      });

      return {
        ok: true,
        message: `Updated alt text for ${result.updated} images!`,
        result,
      };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  return { ok: false, error: "Invalid intent" };
};

export default function ImageSeoPage() {
  const { overview, scanLimit, template: initialTemplate } = useLoaderData();
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
    <s-page heading="Image Alt-Text Optimizer">
      {/* Top Overview Cards */}
      <s-section>
        <s-grid gridtemplatecolumns="repeat(auto-fit, minmax(200px, 1fr))" gap="base">
          <StatBox
            label="Total Products in Store"
            value={overview.totalInStore}
            subtext={`${overview.totalProducts} scanned`}
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
            label="SEO Readiness"
            value={
              overview.totalImages > 0
                ? `${Math.round(
                    ((overview.totalImages - overview.missingAltCount) /
                      overview.totalImages) *
                      100,
                  )}%`
                : "100%"
            }
            icon={CheckCircle2}
            tone="success"
          />
        </s-grid>
      </s-section>

      {/* Template Setting Card */}
      <s-section heading="Alt-Text Generation Template">
        <s-paragraph>
          Google uses image alt text to understand product visuals. Define your automatic alt-text pattern:
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
                onClick={handleSaveTemplate}
                {...(isSubmitting ? { loading: true } : {})}
              >
                Save Template
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
                        onClick={() => handleOptimizeProduct(product.id, product.title)}
                        {...(isSubmitting ? { loading: true } : {})}
                      >
                        <Sparkles size={14} style={{ marginRight: "4px" }} />
                        Optimize ({product.missingAltImages.length}) Images
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
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
