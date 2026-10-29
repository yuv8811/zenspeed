/**
 * SEO & Image Optimization Services for Shopify
 */
import ImageBackup from "../models/imageBackup.model";
import { connectDB } from "../db.server";

/**
 * Scan products for missing alt text and SEO meta tags with pagination support
 *
 * @param {Object} admin - Shopify Admin GraphQL client
 * @param {Object} [options]
 * @param {number} [options.maxProducts=250] - Maximum number of products to scan
 */
export async function getStoreSeoOverview(admin, { maxProducts = 250 } = {}) {
  let shop = {};
  let totalInStore = null;

  try {
    const shopRes = await admin.graphql(
      `#graphql
      query getShopAndCount {
        shop {
          name
          myshopifyDomain
        }
        productsCount {
          count
        }
      }`,
    );
    const shopJson = await shopRes.json();
    shop = shopJson.data?.shop || {};
    totalInStore = shopJson.data?.productsCount?.count ?? null;
  } catch (err) {
    console.warn("Could not fetch shop or productsCount:", err.message);
  }

  const allProducts = [];
  let hasNextPage = true;
  let cursor = null;
  const batchSize = 100; // Fetch up to 100 per GraphQL request

  while (hasNextPage && allProducts.length < maxProducts) {
    const toFetch = Math.min(batchSize, maxProducts - allProducts.length);

    try {
      const response = await admin.graphql(
        `#graphql
        query getProductsBatch($first: Int!, $cursor: String) {
          products(first: $first, after: $cursor) {
            pageInfo {
              hasNextPage
              endCursor
            }
            edges {
              node {
                id
                title
                handle
                seo {
                  title
                  description
                }
                media(first: 10) {
                  edges {
                    node {
                      ... on MediaImage {
                        id
                        alt
                        image {
                          url
                          width
                          height
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }`,
        {
          variables: {
            first: toFetch,
            cursor,
          },
        },
      );

      const json = await response.json();
      const pageProducts = json.data?.products?.edges?.map((e) => e.node) || [];
      allProducts.push(...pageProducts);

      hasNextPage = json.data?.products?.pageInfo?.hasNextPage || false;
      cursor = json.data?.products?.pageInfo?.endCursor || null;

      if (!cursor || pageProducts.length === 0) break;
    } catch (fetchErr) {
      console.error("Error fetching product batch:", fetchErr);
      break;
    }
  }

  let totalImages = 0;
  let missingAltCount = 0;
  let missingSeoTitleCount = 0;
  let missingSeoDescCount = 0;
  const duplicateTitlesMap = new Map();

  const productAudits = allProducts.map((prod) => {
    const images = prod.media?.edges?.map((m) => m.node) || [];
    totalImages += images.length;

    const unoptimizedImages = images.filter(
      (img) => !img.alt || img.alt.trim() === "",
    );
    missingAltCount += unoptimizedImages.length;

    const currentTitle = prod.seo?.title?.trim() || prod.title;
    const hasCustomTitle = Boolean(prod.seo?.title?.trim());
    const hasCustomDesc = Boolean(prod.seo?.description?.trim());

    if (!hasCustomTitle) missingSeoTitleCount++;
    if (!hasCustomDesc) missingSeoDescCount++;

    if (currentTitle) {
      duplicateTitlesMap.set(
        currentTitle.toLowerCase(),
        (duplicateTitlesMap.get(currentTitle.toLowerCase()) || 0) + 1,
      );
    }

    return {
      id: prod.id,
      title: prod.title,
      handle: prod.handle,
      seoTitle: prod.seo?.title || "",
      seoDescription: prod.seo?.description || "",
      totalImages: images.length,
      missingAltImages: unoptimizedImages,
      images,
    };
  });

  let duplicateTitleCount = 0;
  for (const count of duplicateTitlesMap.values()) {
    if (count > 1) duplicateTitleCount += count;
  }

  return {
    shopName: shop.name || "Store",
    domain: shop.myshopifyDomain || "",
    totalInStore: totalInStore !== null ? totalInStore : allProducts.length,
    totalProducts: allProducts.length,
    totalImages,
    missingAltCount,
    missingSeoTitleCount,
    missingSeoDescCount,
    duplicateTitleCount,
    products: productAudits,
  };
}

/**
 * Bulk optimize missing image alt text for a single product with MongoDB backup
 */
export async function updateProductImageAlts({
  admin,
  shop = "",
  productId,
  productTitle,
  shopName,
  template = "{product_title} - {shop_name}",
}) {
  const queryResponse = await admin.graphql(
    `#graphql
    query getProductMedia($id: ID!) {
      product(id: $id) {
        media(first: 20) {
          edges {
            node {
              ... on MediaImage {
                id
                alt
                image {
                  url
                }
              }
            }
          }
        }
      }
    }`,
    { variables: { id: productId } },
  );

  const queryJson = await queryResponse.json();
  const mediaList =
    queryJson.data?.product?.media?.edges?.map((e) => e.node) || [];

  const mediaToUpdate = [];
  const backupDocs = [];
  let index = 1;

  for (const item of mediaList) {
    if (!item.alt || item.alt.trim() === "") {
      const generatedAlt = template
        .replace(/\{product_title\}/gi, productTitle)
        .replace(/\{shop_name\}/gi, shopName)
        .replace(/\{index\}/gi, String(index));

      mediaToUpdate.push({
        id: item.id,
        alt: generatedAlt,
      });

      if (shop) {
        backupDocs.push({
          shop,
          productId,
          productTitle,
          mediaId: item.id,
          originalAlt: item.alt || "",
          optimizedAlt: generatedAlt,
          imageUrl: item.image?.url || "",
          reverted: false,
        });
      }

      index++;
    }
  }

  if (mediaToUpdate.length === 0) {
    return { updated: 0, media: [] };
  }

  const updateResponse = await admin.graphql(
    `#graphql
    mutation updateProductMedia($productId: ID!, $media: [UpdateMediaInput!]!) {
      productUpdateMedia(productId: $productId, media: $media) {
        media {
          id
          alt
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        productId,
        media: mediaToUpdate,
      },
    },
  );

  const updateJson = await updateResponse.json();

  // Save backups to MongoDB
  if (shop && backupDocs.length > 0) {
    try {
      await connectDB();
      await ImageBackup.insertMany(backupDocs);
    } catch (dbErr) {
      console.warn("Could not save image backup to MongoDB:", dbErr.message);
    }
  }

  return {
    updated: mediaToUpdate.length,
    media: updateJson.data?.productUpdateMedia?.media || [],
    errors: updateJson.data?.productUpdateMedia?.userErrors || [],
  };
}

/**
 * Revert a single image alt text from MongoDB backup
 */
export async function revertImageAlt({ admin, shop, backupId }) {
  await connectDB();
  const backup = await ImageBackup.findOne({ _id: backupId, shop });
  if (!backup) {
    throw new Error("Backup record not found");
  }

  const updateResponse = await admin.graphql(
    `#graphql
    mutation revertMediaAlt($productId: ID!, $media: [UpdateMediaInput!]!) {
      productUpdateMedia(productId: $productId, media: $media) {
        media {
          id
          alt
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        productId: backup.productId,
        media: [
          {
            id: backup.mediaId,
            alt: backup.originalAlt,
          },
        ],
      },
    },
  );

  const updateJson = await updateResponse.json();
  const errors = updateJson.data?.productUpdateMedia?.userErrors || [];
  if (errors.length > 0) {
    throw new Error(errors.map((e) => e.message).join(", "));
  }

  backup.reverted = true;
  await backup.save();

  return { ok: true, backup };
}

/**
 * Revert all active image backups for the store
 */
export async function revertAllImageAlts({ admin, shop }) {
  await connectDB();
  const activeBackups = await ImageBackup.find({ shop, reverted: false }).limit(250);
  let revertedCount = 0;

  // Group by productId
  const byProduct = new Map();
  for (const b of activeBackups) {
    if (!byProduct.has(b.productId)) {
      byProduct.set(b.productId, []);
    }
    byProduct.get(b.productId).push(b);
  }

  for (const [productId, backups] of byProduct.entries()) {
    try {
      const mediaList = backups.map((b) => ({
        id: b.mediaId,
        alt: b.originalAlt,
      }));

      await admin.graphql(
        `#graphql
        mutation revertBatchMediaAlt($productId: ID!, $media: [UpdateMediaInput!]!) {
          productUpdateMedia(productId: $productId, media: $media) {
            media {
              id
            }
          }
        }`,
        {
          variables: {
            productId,
            media: mediaList,
          },
        },
      );

      const ids = backups.map((b) => b._id);
      await ImageBackup.updateMany({ _id: { $in: ids } }, { reverted: true });
      revertedCount += backups.length;
    } catch (err) {
      console.warn(`Failed reverting product ${productId}:`, err.message);
    }
  }

  return { revertedCount };
}

/**
 * Bulk optimize all missing image alt texts across the catalog
 */
export async function bulkOptimizeStoreImages({
  admin,
  shop,
  shopName,
  template = "{product_title} - {shop_name}",
  maxProducts = 100,
}) {
  const overview = await getStoreSeoOverview(admin, { maxProducts });
  let totalOptimized = 0;

  for (const product of overview.products) {
    if (product.missingAltImages.length > 0) {
      const res = await updateProductImageAlts({
        admin,
        shop,
        productId: product.id,
        productTitle: product.title,
        shopName,
        template,
      });
      totalOptimized += res.updated || 0;
    }
  }

  return { totalOptimized };
}

/**
 * Update product SEO title & description
 */
export async function updateProductSeo({ admin, productId, seoTitle, seoDescription }) {
  const response = await admin.graphql(
    `#graphql
    mutation updateProductSeo($input: ProductInput!) {
      productUpdate(input: $input) {
        product {
          id
          title
          seo {
            title
            description
          }
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        input: {
          id: productId,
          seo: {
            title: seoTitle,
            description: seoDescription,
          },
        },
      },
    },
  );

  const json = await response.json();
  return {
    product: json.data?.productUpdate?.product,
    errors: json.data?.productUpdate?.userErrors || [],
  };
}

/**
 * Bulk apply SEO Meta Title and Description to products missing custom SEO tags
 */
export async function bulkApplySeoMeta({
  admin,
  shopName,
  titleTemplate = "{title} | {shop_name}",
  descriptionTemplate = "Shop {title} at {shop_name}. Find top quality, fast shipping, and great offers today.",
  maxProducts = 100,
}) {
  const overview = await getStoreSeoOverview(admin, { maxProducts });
  let updatedCount = 0;

  for (const product of overview.products) {
    const hasCustomTitle = Boolean(product.seoTitle);
    const hasCustomDesc = Boolean(product.seoDescription);

    if (!hasCustomTitle || !hasCustomDesc) {
      const newTitle = hasCustomTitle
        ? product.seoTitle
        : titleTemplate
            .replace(/\{title\}/gi, product.title)
            .replace(/\{shop_name\}/gi, shopName);

      const newDesc = hasCustomDesc
        ? product.seoDescription
        : descriptionTemplate
            .replace(/\{title\}/gi, product.title)
            .replace(/\{shop_name\}/gi, shopName);

      const res = await updateProductSeo({
        admin,
        productId: product.id,
        seoTitle: newTitle,
        seoDescription: newDesc,
      });

      if (!res.errors || res.errors.length === 0) {
        updatedCount++;
      }
    }
  }

  return { updatedCount };
}
