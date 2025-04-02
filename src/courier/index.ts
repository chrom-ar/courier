import { Provider } from '../providers/index.js';
import { WakuClient } from '../providers/waku/index.js';
import { initializeLogger } from '../lib/logger.js';

/**
 * Callback type for message subscription
 */
export type MessageCallback = (message: any) => void;

/**
 * Courier class for simplifying publisher/subscriber patterns
 */
export class Courier implements Provider {
  private static provider: Provider;
  private static instance: Courier;

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {
    // Initialize logger from environment variables
    initializeLogger();
  }

  /**
   * Get the singleton instance of Courier
   */
  public static async getInstance(): Promise<Courier> {
    if (!Courier.instance) {
      Courier.instance = new Courier();
    }

    // The only provider currently supported is Waku
    if (!Courier.provider) {
      Courier.provider = await WakuClient.getInstance();
    }

    return Courier.instance;
  }

  /**
   * Subscribe to incoming messages
   * @param callback Function to call when a message is received
   * @returns Function to unsubscribe
   */
  public async subscribe(topic: string, callback: MessageCallback): Promise<void> {
    await Courier.provider.subscribe(topic, callback);
  }

  /**
   * Send a message to all subscribers
   * @param message Message to send
   */
  public async send(body: object, topic: string, roomId: string): Promise<void> {
    await Courier.provider.send(body, topic, roomId);
  }

  public async unsubscribe(topic: string): Promise<void> {
    await Courier.provider.unsubscribe(topic);
  }
}
