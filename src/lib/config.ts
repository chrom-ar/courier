import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

/**
 * Interface defining the configuration for Waku networking
 */
export interface WakuConfig {
  /** Static peers to connect to, comma-separated */
  staticPeers: string;

  /** Number of times to attempt connecting to peers */
  pingCount: number;

  /** The base topic name used for communication */
  topics: string;

  /** The content topic format including a placeholder */
  contentTopic: string;
}

/**
 * Function to get a configured WakuConfig from environment variables
 */
export function getWakuConfig(): WakuConfig {
  return {
    staticPeers: process.env.WAKU_STATIC_PEERS || '',
    pingCount: parseInt(process.env.WAKU_PING_COUNT || '') || 10,
    topics: process.env.WAKU_TOPICS || 'default',
    contentTopic: process.env.WAKU_CONTENT_TOPIC || '/waku/2/PLACEHOLDER/proto',
  };
}
