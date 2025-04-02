# Chroma Courier

A messaging abstraction library that simplifies publisher/subscriber patterns, allowing users to send messages and receive responses independently of the underlying protocol.

## Installation

```shell
npm install @chrom-ar/courier
```
## Configuration

Create your own configuration by copying the example environment file and customizing the values:

```shell
cp .env.example .env
```

## Usage

Basic example:

```typescript
import { Courier } from '@chrom-ar/courier';

const courier = await Courier.getInstance();

// Subscribe to messages on a specific topic
courier.subscribe('my-topic', (message) => {
  console.log('Received message:', message);
});

// Send a message with topic and room ID
courier.send({ text: 'Hello, world!' }, 'my-topic', 'room-123');

// Unsubscribe when done
courier.unsubscribe('my-topic');
```

## Features

- Protocol-agnostic messaging
- Simple singleton-based messaging with send/subscribe methods
- Built with TypeScript for type safety
