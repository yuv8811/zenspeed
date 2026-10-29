/**
 * SEO & Image Optimization Services for Shopify
 */

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

  const productAudits = allProducts.map((prod) => {
    const images = prod.media?.edges?.map((m) => m.node) || [];
    totalImages += images.length;

    const unoptimizedImages = images.filter(
      (img) => !img.alt || img.alt.trim() === "",
    );
    missingAltCount += unoptimizedImages.length;

    const hasCustomTitle = Boolean(prod.seo?.title?.trim());
    const hasCustomDesc = Boolean(prod.seo?.description?.trim());

    if (!hasCustomTitle) missingSeoTitleCount++;
    if (!hasCustomDesc) missingSeoDescCount++;

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

  return {
    shopName: shop.name || "Store",
    domain: shop.myshopifyDomain || "",
    totalInStore: totalInStore !== null ? totalInStore : allProducts.length,
    totalProducts: allProducts.length,
    totalImages,
    missingAltCount,
    missingSeoTitleCount,
    missingSeoDescCount,
    products: productAudits,
  };
}

/**
 * Bulk optimize missing image alt text for a product
 */
export async function updateProductImageAlts({
  admin,
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
  return {
    updated: mediaToUpdate.length,
    media: updateJson.data?.productUpdateMedia?.media || [],
    errors: updateJson.data?.productUpdateMedia?.userErrors || [],
  };
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
