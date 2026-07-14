import WebSocket, { type RawData } from "ws";

import type { RealtimeSocketFactory } from "./openai-realtime-transcription-session.js";

type SocketListener = (event?: unknown) => void;

export const createOpenAIRealtimeWebSocketFactory: RealtimeSocketFactory = ({
  apiKey,
  url,
}) => {
  const socket = new WebSocket(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
  const listenerWrappers = new Map<
    string,
    Map<SocketListener, SocketListener>
  >();
  const closeErrorSink = (): void => {};
  const releaseCloseErrorSink = (): void => {
    socket.off("error", closeErrorSink);
    socket.off("close", releaseCloseErrorSink);
  };

  socket.on("error", closeErrorSink);
  socket.on("close", releaseCloseErrorSink);

  return {
    addEventListener: (type, listener) => {
      const wrapper = createListenerWrapper(type, listener);
      const listeners =
        listenerWrappers.get(type) ?? new Map<SocketListener, SocketListener>();

      listeners.set(listener, wrapper);
      listenerWrappers.set(type, listeners);
      socket.on(type, wrapper);
    },
    close: () => {
      socket.close();
    },
    removeEventListener: (type, listener) => {
      const listeners = listenerWrappers.get(type);
      const wrapper = listeners?.get(listener);

      if (!wrapper) {
        return;
      }

      socket.off(type, wrapper);
      listeners?.delete(listener);
      if (listeners?.size === 0) {
        listenerWrappers.delete(type);
      }
    },
    send: (message) => {
      socket.send(message);
    },
  };

  function createListenerWrapper(
    type: string,
    listener: SocketListener,
  ): SocketListener {
    if (type === "message") {
      return (data?: unknown) => {
        listener({ data: rawWebSocketDataToString(data as RawData) });
      };
    }

    return (event?: unknown) => listener(event);
  }
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
