import mongoose from "mongoose";

export const auditSchema = new mongoose.Schema(
  {
    shop: {
      type: String,
      required: true,
      index: true,
    },
    url: {
      type: String,
      required: true,
    },
    strategy: {
      type: String,
      enum: ["mobile", "desktop", "both"],
      default: "both",
    },
    scores: {
      performance: Number,
      seo: Number,
      accessibility: Number,
      bestPractices: Number,
    },
    lighthouseMetrics: [
      {
        id: String,
        title: String,
        displayValue: String,
        score: Number,
        description: String,
      },
    ],
    cruxMetrics: {
      fcp: { category: String, percentile: Number },
      lcp: { category: String, percentile: Number },
      cls: { category: String, percentile: String },
      inp: { category: String, percentile: Number },
      overallCategory: String,
      isOriginFallback: Boolean,
    },
    speedOpportunities: [
      {
        id: String,
        title: String,
        displayValue: String,
        score: Number,
        savingsMs: Number,
        savingsBytes: Number,
      },
    ],
    mobile: {
      scores: {
        performance: Number,
        seo: Number,
        accessibility: Number,
        bestPractices: Number,
      },
      lighthouseMetrics: Array,
      cruxMetrics: Object,
      speedOpportunities: Array,
      seoAudits: Array,
    },
    desktop: {
      scores: {
        performance: Number,
        seo: Number,
        accessibility: Number,
        bestPractices: Number,
      },
      lighthouseMetrics: Array,
      cruxMetrics: Object,
      speedOpportunities: Array,
      seoAudits: Array,
    },
  },
  {
    timestamps: true,
  },
);

/**
 * Returns a Mongoose model bound to the store's dedicated collection in the audit database.
 * Database: Zenspeed_Audits
 * Collection: <sanitized_store_domain> (e.g. heritage-dev-3_myshopify_com)
 *
 * @param {string} shop - The shop domain (e.g. heritage-dev-3.myshopify.com)
 * @returns {mongoose.Model}
 */
export function getStoreAuditModel(shop) {
  if (!shop) {
    throw new Error("Shop domain is required to retrieve store audit model");
  }

  // eslint-disable-next-line no-undef
  const auditDbName = process.env.MONGODB_AUDITS_DB || "Zenspeed_Audits";
  const auditDb = mongoose.connection.useDb(auditDbName, { useCache: true });

  // Sanitize shop domain into a clean MongoDB collection name
  const collectionName = shop.toLowerCase().replace(/[^a-z0-9_-]/g, "_");

  if (auditDb.models[collectionName]) {
    return auditDb.models[collectionName];
  }

  return auditDb.model(collectionName, auditSchema, collectionName);
}

const Audit = mongoose.models.Audit || mongoose.model("Audit", auditSchema);

export default Audit;
