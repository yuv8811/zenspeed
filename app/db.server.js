import dns from "node:dns";
import mongoose from "mongoose";

// Ensure DNS servers resolve MongoDB SRV records on platforms with restricted local DNS
try {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
} catch (e) {
  // Ignore if setting DNS servers fails
}

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017";
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || "Zenspeed";

if (process.env.NODE_ENV !== "production") {
  if (!global.mongooseGlobal) {
    global.mongooseGlobal = { conn: null, promise: null };
  }
}

const cached = global.mongooseGlobal ?? { conn: null, promise: null };

export async function connectDB() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      dbName: MONGODB_DB_NAME,
    };

    cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongooseInstance) => {
      console.log(`[MongoDB] Connected to database: ${MONGODB_DB_NAME}`);
      return mongooseInstance;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

export default mongoose;
