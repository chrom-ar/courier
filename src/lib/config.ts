import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

const envPath = path.resolve(process.cwd(), ".env");

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

export interface WakuConfig {
  /** Static peers to connect to, comma-separated */
  staticPeers: string;

  /** Number of times to attempt connecting to peers */
  pingCount: number;

  /** The topic names used for communication, comma-separated */
  topics: string;

  /** The content topic format including a placeholder */
  contentTopic: string;
}

export function getWakuConfig(): WakuConfig {
  return {
    staticPeers: process.env.WAKU_STATIC_PEERS || "",
    pingCount: parseInt(process.env.WAKU_PING_COUNT || "") || 10,
    topics: process.env.WAKU_TOPICS || "default",
    contentTopic: process.env.WAKU_CONTENT_TOPIC || "/waku/2/PLACEHOLDER/proto",
  };
}
