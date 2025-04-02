export interface Provider {
  subscribe(topic: string, callback: (message: unknown) => void): void;
  send(body: object, topic: string, roomId: string): void;
  unsubscribe(topic: string): void;
}
