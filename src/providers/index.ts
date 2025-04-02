export interface Provider {
  subscribe(topic: string, callback: (message: any) => void): void;
  send(body: object, topic: string, roomId: string): void;
  unsubscribe(topic: string): void;
}
