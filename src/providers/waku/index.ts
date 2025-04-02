import {
  bytesToUtf8,
  createDecoder,
  createEncoder,
  createLightNode,
  HealthStatusChangeEvents,
  HealthStatus,
  IDecodedMessage,
  ISubscription,
  LightNode,
  Protocols,
  utf8ToBytes,
} from "@waku/sdk";
import { tcp } from "@libp2p/tcp";
import protobuf from "protobufjs";
import { EventEmitter } from "events";
import { Provider } from "../index.js";
import { getWakuConfig, WakuConfig } from "../../lib/config.js";
import { randomHexString, sleep } from "../../lib/utils.js";
import { logger } from "../../lib/logger.js";

interface WakuMessageEvent {
  timestamp: number;
  body: any;
  roomId: string;
}

interface WakuEventCallback {
  (event: WakuMessageEvent): Promise<void>;
}

const ChatMessage = new protobuf.Type("ChatMessage")
  .add(new protobuf.Field("timestamp", 1, "uint64"))
  .add(new protobuf.Field("body", 2, "bytes"))
  .add(new protobuf.Field("roomId", 3, "bytes"));

export class WakuClient extends EventEmitter implements Provider {
  private static instance: WakuClient | null = null;

  config: WakuConfig;
  node: LightNode | null = null; // This will be the LightNode

  private subscriptionMap: Map<string, {
    subscription: any;
    expiration: number;
  }> = new Map();

  private constructor() {
    super();
    this.config = getWakuConfig();
  }

  private isInitializing = false;
  private initPromise: Promise<void> | null = null;

  public static async getInstance(): Promise<WakuClient> {
    if (!this.instance) {
      this.instance = new WakuClient();

      await this.instance.init();
    } else if (this.instance.isInitializing && this.instance.initPromise) {
      // Wait for ongoing initialization to complete
      await this.instance.initPromise;
    }

    return this.instance;
  }

  async init() {
    if (this.isInitializing) {
      return this.initPromise;
    }

    this.isInitializing = true;
    this.initPromise = this.startNode();

    try {
      await this.initPromise;
    } finally {
      this.isInitializing = false;
    }
  }

  private async startNode() {
    await this.createNode();
    await this.waitForPeers();
    await this.registerHealthListener();

    logger.success("[WakuBase] Connected to Waku");
  }

  /**
   * Subscribe to the user-specified WAKU_CONTENT_TOPIC
   * If it contains the placeholder, we replace with the WAKU_TOPIC value, possibly with an appended random hex if so desired.
   */
  async subscribe(topic: string, fn: any, expirationSeconds: number = 20): Promise<void> {
    if (!topic) {
      if (!this.config.contentTopic || !this.config.topics) {
        throw new Error("[WakuBase] subscription not configured (missing env). No messages will be received.");
      }
    }

    const subscribedTopics = await this.buildFullTopics(topic);

    for (const subscribedTopic of subscribedTopics) {
      const subscriptionResult = await this.node?.filter.subscribe(
        [createDecoder(subscribedTopic)],
        async (wakuMsg: IDecodedMessage) => this.handleSubscriptionMessage(wakuMsg, fn)
      );

      if (!subscriptionResult || subscriptionResult.error) {
        logger.error(`[WakuBase] Error creating subscription: ${subscriptionResult?.error?.toString()}`);
      } else {
        await this.checkAndSaveSubscription(subscriptionResult.subscription, subscribedTopic, fn, expirationSeconds);
      }
    }
  }

  async send(body: object, topic: string, roomId: string): Promise<void> {
    const subscribedTopics = await this.buildFullTopics(topic);

    for (const subscribedTopic of subscribedTopics) {
      logger.info(`[WakuBase] Sending message to topic ${subscribedTopic} =>`, body);

      const protoMessage = ChatMessage.create({
        timestamp: Date.now(),
        roomId:    utf8ToBytes(roomId),
        body:      utf8ToBytes(JSON.stringify(body)),
      });

      if (!this.node) {
        throw new Error("[WakuBase] Waku node not initialized");
      }

      try {
        await this.node.lightPush.send(
          createEncoder({ contentTopic: topic }),
          { payload: ChatMessage.encode(protoMessage).finish() }
        );
        logger.success("[WakuBase] Message sent!");
      } catch (e) {
        logger.error("[WakuBase] Error sending message:", e);
      }
    }
  }

  async unsubscribe(topic: string): Promise<void> {
    if (this.node) {
      const subscribedTopics = await this.buildFullTopics(topic);

      for (const subscribedTopic of subscribedTopics) {
        const subscription = this.subscriptionMap.get(subscribedTopic);

        if (subscription) {
          logger.info(`[WakuBase] Unsubscribing from topic: ${subscribedTopic}`);
          await subscription.subscription.unsubscribe();
          this.subscriptionMap.delete(subscribedTopic);
        } else {
          logger.warn(`[WakuBase] No subscription found for topic: ${subscribedTopic}`);
        }
      }
    }
  }

  async stop(): Promise<void> {
    if (this.node) {
      logger.info("[WakuBase] stopping node...");
      await this.node.stop();
    }
  }

  defaultIntentsTopics(): string[] {
    const topics = this.config.topics.split(',');

    return topics.map(topic => this.config.contentTopic.replace("PLACEHOLDER", topic.trim()));
  }

  async buildFullTopics(topic?: string): Promise<string[]> {
    if (!topic) {
      return this.defaultIntentsTopics()
    } else if (topic.includes("random")) {
      // Optionally append random if you want ephemeral uniqueness
      return [this.config.contentTopic.replace("PLACEHOLDER", await randomHexString(16))];
    } else if (topic.includes(",")) {
      return topic.split(",").map((t) => this.config.contentTopic.replace("PLACEHOLDER", t.trim()));
    } else if (!topic.startsWith("/")) {
      // partial topic
      return [this.config.contentTopic.replace("PLACEHOLDER", topic)];
    }

    return [topic];
  }

  private async createNode() {
    const peers = this.config.staticPeers.split(",");

    if (peers.length > 0) {
      // NOTE: If other transports are needed we **have** to add them here
      this.node = await createLightNode({
        libp2p: { transports: [tcp()], hideWebSocketInfo: true }
      });

      for (const peer of peers) {
        // Dial fails sometimes
        for (let i = 0; i < 5; i++) {
          try {
            await this.node.dial(peer);
            logger.info(`[WakuBase] ${peer} connected`);
            break
          } catch (e) {
            logger.error(`[WakuBase] Error ${i} dialing peer ${peer}: ${e}`);
            logger.error(e as any);
            await sleep(500)
          }
        }
      }
    } else {
      this.node = await createLightNode({ defaultBootstrap: true });
    }

    await this.node.start();
  }

  private async waitForPeers() {
    // Wait for remote peer. This is repeated up to WAKU_PING_COUNT times.
    for (let i = 0; i < this.config.pingCount; i++) {
      try {
        await this.node?.waitForPeers([Protocols.LightPush, Protocols.Filter], 5000);

        if (this.node?.isConnected()) {
          break;
        }
      } catch (e) {
        logger.info(`[WakuBase] Attempt ${i + 1}/${this.config.pingCount} => still waiting for peers`);

        if (i === this.config.pingCount - 1) {
          throw new Error("[WakuBase] Could not find remote peer after max attempts");
        }

        await sleep(500);
      }
    }
  }

  private async registerHealthListener() {
    this.node?.health.addEventListener(HealthStatusChangeEvents.StatusChange, async (event: any) => {
      logger.info(`Health status changed to: ${event.detail}`);

      if (event.detail === HealthStatus.Unhealthy) {
        logger.info("[WakuBase] Trying to reconnect with exponential backoff...");

        // Implement exponential backoff for reconnection attempts
        let retryCount = 0;
        let reconnected = false;
        const maxRetries = 10; // Maximum retry attempts

        while (!reconnected && retryCount < maxRetries) {
          try {
            const backoffTime = Math.min(90000, 1000 * Math.pow(2, retryCount)); // Cap at 90 seconds

            logger.info(`[WakuBase] Reconnect attempt ${retryCount + 1}/${maxRetries} after ${backoffTime}ms delay`);

            await sleep(backoffTime);
            await this.init();

            reconnected = true;
            logger.success("[WakuBase] Successfully reconnected");
          } catch (error) {
            logger.error(`[WakuBase] Reconnection attempt ${retryCount + 1} failed: ${error}`);
            retryCount++;
          }
        }

        if (!reconnected) {
          logger.error("[WakuBase] Failed to reconnect after maximum retry attempts");
        }
      }
    });

    await sleep(2000);

    logger.info("WakuNode Status", this.node?.health.toString());
  }

  private async checkAndSaveSubscription(subscription: ISubscription, topic: string, fn: any, expirationSeconds: number) {
    // Attempt a 'ping' to ensure it is up
    for (let i = 0; i < this.config.pingCount; i++) {
      try {
        await subscription.ping();
        break;
      } catch (e) {
        if (e instanceof Error && e.message.includes("peer has no subscriptions")) {
          logger.warn("[WakuBase] Peer has no subs, retrying subscription...");
          return this.subscribe(topic, fn);
        }
        logger.warn(`[WakuBase] Subscription ping attempt ${i} error, retrying...`);

        await sleep(500);
      }
    }

    logger.success(`[WakuBase] Subscribed to topic: ${topic}`);

    // Save subscription to check expiration
    this.subscriptionMap.set(topic, {
      subscription: subscription,
      expiration: Date.now() + expirationSeconds * 1000
    });
  }

  private async handleSubscriptionMessage(message: IDecodedMessage, fn: WakuEventCallback) {
    if (!message?.payload) {
      logger.error("[WakuBase] Received message with no payload");
      return;
    }

    let msgDecoded: any;

    try {
      msgDecoded = ChatMessage.decode(message.payload);

      const event: WakuMessageEvent = {
        body: JSON.parse(bytesToUtf8(msgDecoded.body)),
        timestamp: Number(msgDecoded.timestamp),
        roomId: bytesToUtf8(msgDecoded.roomId)
      };

      await fn(event);
    } catch (err) {
      logger.error("[WakuBase] Error decoding message payload:", err, msgDecoded);
    }
  }
}
