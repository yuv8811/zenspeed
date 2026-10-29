import mongoose from "mongoose";

const imageBackupSchema = new mongoose.Schema(
  {
    shop: {
      type: String,
      required: true,
      index: true,
    },
    productId: {
      type: String,
      required: true,
      index: true,
    },
    productTitle: {
      type: String,
      default: "",
    },
    mediaId: {
      type: String,
      required: true,
    },
    originalAlt: {
      type: String,
      default: "",
    },
    optimizedAlt: {
      type: String,
      default: "",
    },
    imageUrl: {
      type: String,
      default: "",
    },
    reverted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

const ImageBackup =
  mongoose.models.ImageBackup || mongoose.model("ImageBackup", imageBackupSchema);

export default ImageBackup;

