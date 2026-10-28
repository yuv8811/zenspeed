import mongoose from "mongoose";

const auditSchema = new mongoose.Schema(
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
      enum: ["mobile", "desktop"],
      default: "mobile",
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
  },
  {
    timestamps: true,
  },
);

const Audit = mongoose.models.Audit || mongoose.model("Audit", auditSchema);

export default Audit;

