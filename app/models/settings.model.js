import mongoose from "mongoose";

const settingsSchema = new mongoose.Schema(
  {
    shop: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    // Speed Optimization Features
    boosterEnabled: {
      type: Boolean,
      default: true,
    },
    instantPreloader: {
      type: Boolean,
      default: true,
    },
    lazyLoadImages: {
      type: Boolean,
      default: true,
    },
    deferNonCriticalScripts: {
      type: Boolean,
      default: false,
    },
    // SEO Features
    jsonLdSchema: {
      type: Boolean,
      default: true,
    },
    autoAltText: {
      type: Boolean,
      default: true,
    },
    altTextTemplate: {
      type: String,
      default: "{product_title} - {shop_name}",
    },
    metaTitleTemplate: {
      type: String,
      default: "{title} | {shop_name}",
    },
    metaDescriptionTemplate: {
      type: String,
      default: "Shop {title} at {shop_name}. Find top quality, fast shipping, and great offers today.",
    },
  },
  {
    timestamps: true,
  },
);

const Settings =
  mongoose.models.Settings || mongoose.model("Settings", settingsSchema);

export default Settings;

