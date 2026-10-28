export default function GuidePage() {
  return (
    <s-page heading="ZenSpeed: Optimization Guide">
      <s-section heading="Shopify Store Speed Optimization">
        <s-paragraph>
          Website speed directly impacts merchant conversion rates and Google search rankings.
          Here are key areas to focus on:
        </s-paragraph>

        <s-heading>1. Image Optimization &amp; Lazy Loading</s-heading>
        <s-paragraph>
          Images usually make up 50% to 75% of total page weight on Shopify stores. Ensure hero
          banners and product images are compressed and formatted as WebP. Set explicit <code>width</code>{" "}
          and <code>height</code> attributes on images to prevent Cumulative Layout Shift (CLS).
        </s-paragraph>

        <s-heading>2. App Audit &amp; Script Tag Minimization</s-heading>
        <s-paragraph>
          Every installed app that injects JavaScript into the storefront increases Total Blocking Time (TBT).
          Periodically review and uninstall apps that are no longer in use, and check your theme files
          (such as <code>theme.liquid</code>) for leftover tracking tags or legacy scripts.
        </s-paragraph>

        <s-heading>3. Critical CSS &amp; Render-Blocking Resources</s-heading>
        <s-paragraph>
          Minimize render-blocking stylesheets and defer non-essential scripts until after the First
          Contentful Paint (FCP) and Largest Contentful Paint (LCP) have completed.
        </s-paragraph>
      </s-section>

      <s-section heading="Technical SEO Best Practices">
        <s-heading>1. Descriptive Title Tags &amp; Meta Descriptions</s-heading>
        <s-paragraph>
          Keep product and collection title tags concise (50–60 characters) and include primary keywords.
          Meta descriptions should be engaging summaries (120–155 characters) with clear calls to action.
        </s-paragraph>

        <s-heading>2. Descriptive Image Alt Text</s-heading>
        <s-paragraph>
          Always provide descriptive alt text for product images to help visually impaired shoppers
          and improve image search indexing on Google.
        </s-paragraph>

        <s-heading>3. Structured Data (JSON-LD)</s-heading>
        <s-paragraph>
          Ensure your theme implements Product, Organization, and BreadcrumbList structured data schemas
          so Google search can display rich product snippets, star ratings, and prices.
        </s-paragraph>
      </s-section>

      <s-section slot="aside" heading="Google Web Vitals Thresholds">
        <s-unordered-list>
          <s-list-item>
            <strong>LCP (Largest Contentful Paint):</strong> Good &le; 2.5s
          </s-list-item>
          <s-list-item>
            <strong>INP (Interaction to Next Paint):</strong> Good &le; 200ms
          </s-list-item>
          <s-list-item>
            <strong>CLS (Cumulative Layout Shift):</strong> Good &le; 0.1
          </s-list-item>
          <s-list-item>
            <strong>FCP (First Contentful Paint):</strong> Good &le; 1.8s
          </s-list-item>
        </s-unordered-list>
      </s-section>

      <s-section slot="aside" heading="Help &amp; Documentation">
        <s-unordered-list>
          <s-list-item>
            <s-link href="https://web.dev/explore/metrics" target="_blank">
              Google Web Vitals Guide
            </s-link>
          </s-list-item>
          <s-list-item>
            <s-link href="https://shopify.dev/docs/themes/best-practices/performance" target="_blank">
              Shopify Theme Performance
            </s-link>
          </s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}
