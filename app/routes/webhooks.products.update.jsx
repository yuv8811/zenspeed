import { authenticate } from "../shopify.server";
import { connectDB } from "../db.server";
import Settings from "../models/settings.model";
import { updateProductImageAlts } from "../services/seo.server";

export const action = async ({ request }) => {
  const { shop, topic, payload, admin } = await authenticate.webhook(request);

  console.log(`Received ${topic} Event for ${shop}`);

  if (admin && payload?.id) {
    try {
      await connectDB();
      const settings = await Settings.findOne({ shop }).lean();

      if (settings?.autoAltText) {
        const productId = String(payload.admin_graphql_api_id || `gid://shopify/Product/${payload.id}`);
        const productTitle = payload.title || "Product";
        const template = settings.altTextTemplate || "{product_title} - {shop_name}";

        await updateProductImageAlts({
          admin,
          shop,
          productId,
          productTitle,
          shopName: shop.split(".")[0],
          template,
        });

        console.log(`[ZenSpeed Webhook] Auto-optimized images for ${productTitle} (${shop})`);
      }
    } catch (err) {
      console.warn("[ZenSpeed Webhook] Error auto-optimizing product images:", err.message);
    }
  }

  return new Response(null, { status: 200 });
};
