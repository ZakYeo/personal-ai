import WebSocket, { type RawData } from "ws";

import type { RealtimeSocketFactory } from "./openai-realtime-transcription.js";

export const createOpenAIRealtimeWebSocketFactory: RealtimeSocketFactory = ({
  apiKey,
  url,
}) => {
  const socket = new WebSocket(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  return {
    addEventListener: (type, listener) => {
      if (type === "message") {
        socket.on("message", (data: RawData) => {
          listener({ data: rawWebSocketDataToString(data) });
        });

        return;
      }

      socket.on(type, (event: unknown) => {
        listener(event);
      });
    },
    close: () => {
      socket.close();
    },
    send: (message) => {
      socket.send(message);
    },
  };
};

function rawWebSocketDataToString(data: RawData): string {
  if (Array.isArray(data)) {
    return Buffer.concat(data).toString("utf8");
  }

  if (Buffer.isBuffer(data)) {
    return data.toString("utf8");
  }

  return Buffer.from(data).toString("utf8");
}
