import type { AddressInfo } from "node:net";
import { WebSocketServer } from "ws";
import { containsControlCharacters } from "../../application/text-safety.js";
import type {
  PresentationControl,
  PresentationControlResult,
} from "../../ports/presentation.js";
import type { AssistantRuntimeEventStream } from "./assistant-runtime-event-stream.js";
import {
  createPresentationClientSession,
  type PresentationClientSession,
} from "./presentation-client-session.js";
import {
  createPresentationProjectionStream,
  type PresentationProjectionStream,
} from "./presentation-projection-stream.js";

const maximumFrameBytes = 65_536;
const maximumControlsPerSecond = 10;

export type {
  PresentationControl,
  PresentationControlResult,
} from "../../ports/presentation.js";

export interface PresentationWebSocketServer {
  readonly port: number;
  stop(): Promise<void>;
}

export function startPresentationWebSocketServer(options: {
  readonly authenticationTimeoutMs?: number;
  readonly clearTimer?: (timer: NodeJS.Timeout) => void;
  readonly eventStream: AssistantRuntimeEventStream;
  readonly handleControl?: (
    control: PresentationControl,
  ) => Promise<PresentationControlResult>;
  readonly now?: () => number;
  readonly port: number;
  readonly projectionStream?: PresentationProjectionStream;
  readonly reportFailure?: (error: unknown) => void;
  readonly setTimer?: (
    callback: () => void,
    milliseconds: number,
  ) => NodeJS.Timeout;
  readonly token: string;
}): Promise<PresentationWebSocketServer> {
  validateServerOptions(options);
  const server = new WebSocketServer({
    host: "127.0.0.1",
    maxPayload: maximumFrameBytes,
    port: options.port,
  });
  const projectionStream =
    options.projectionStream ?? createPresentationProjectionStream();
  const sessions = new Set<PresentationClientSession>();
  let activeSession: PresentationClientSession | undefined;

  server.on("connection", (socket) => {
    const session = createPresentationClientSession({
      authenticationTimeoutMs: options.authenticationTimeoutMs ?? 5_000,
      clearTimer: options.clearTimer ?? clearTimeout,
      eventStream: options.eventStream,
      ...(options.handleControl
        ? { handleControl: options.handleControl }
        : {}),
      maximumControlsPerSecond,
      now: options.now ?? Date.now,
      onAuthenticated: () => {
        if (activeSession?.isAuthenticated()) return false;
        activeSession = session;
        return true;
      },
      onClosed: () => {
        sessions.delete(session);
        if (activeSession === session) activeSession = undefined;
      },
      projectionStream,
      reportFailure: options.reportFailure ?? (() => {}),
      setTimer: options.setTimer ?? setTimeout,
      socket,
      token: options.token,
    });
    sessions.add(session);
  });

  return listen(
    server,
    options.eventStream,
    projectionStream,
    sessions,
    options.reportFailure ?? (() => {}),
  );
}

function listen(
  server: WebSocketServer,
  eventStream: AssistantRuntimeEventStream,
  projectionStream: PresentationProjectionStream,
  sessions: Set<PresentationClientSession>,
  reportFailure: (error: unknown) => void,
): Promise<PresentationWebSocketServer> {
  return new Promise((resolve, reject) => {
    const fail = (error: Error) => {
      for (const session of sessions) session.close();
      server.close();
      reject(error);
    };
    server.once("error", fail);
    server.once("listening", () => {
      server.off("error", fail);
      server.on("error", reportFailure);
      const address = server.address();
      if (!isAddressInfo(address)) {
        fail(new Error("Presentation server did not bind a TCP address."));
        return;
      }
      const unsubscribe = eventStream.subscribe((event) => {
        for (const session of sessions) {
          if (session.isAuthenticated()) session.sendEvent(event);
        }
      });
      const unsubscribeProjection = projectionStream.subscribe((projection) => {
        for (const session of sessions) {
          if (session.isAuthenticated()) session.sendProjection(projection);
        }
      });
      resolve(
        Object.freeze({
          port: address.port,
          stop: () =>
            stopServer(server, sessions, [unsubscribe, unsubscribeProjection]),
        }),
      );
    });
  });
}

function stopServer(
  server: WebSocketServer,
  sessions: Set<PresentationClientSession>,
  unsubscribes: readonly (() => void)[],
): Promise<void> {
  for (const unsubscribe of unsubscribes) unsubscribe();
  for (const session of sessions) session.close();
  sessions.clear();
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function validateServerOptions(options: { port: number; token: string }): void {
  if (
    !Number.isInteger(options.port) ||
    options.port < 0 ||
    options.port > 65_535
  ) {
    throw new Error(
      "Presentation port must be an integer from 0 through 65535.",
    );
  }
  if (
    options.token.length < 32 ||
    options.token.length > 512 ||
    containsControlCharacters(options.token)
  ) {
    throw new Error("Presentation token must be 32 to 512 safe characters.");
  }
}

function isAddressInfo(
  value: AddressInfo | string | null,
): value is AddressInfo {
  return value !== null && typeof value !== "string";
}
