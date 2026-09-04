import { createHash, timingSafeEqual } from "node:crypto";
import type { AddressInfo } from "node:net";
import WebSocket, { WebSocketServer, type RawData } from "ws";
import { containsControlCharacters } from "../../application/text-safety.js";
import type { AssistantRuntimeEventStream } from "./assistant-runtime-event-stream.js";

const protocolVersion = 1;
const maximumFrameBytes = 65_536;
const maximumRequestCharacters = 16_000;
const maximumIdentifierCharacters = 128;
const maximumControlsPerSecond = 10;

export type PresentationControl =
  | {
      readonly requestId: string;
      readonly text: string;
      readonly type: "submit_text";
    }
  | {
      readonly interactionId: string;
      readonly requestId: string;
      readonly type: "confirm" | "decline";
    }
  | {
      readonly requestId: string;
      readonly type: "dismiss_overlay" | "stop_listening";
    };

export interface PresentationControlResult {
  readonly message?: string;
  readonly status: "accepted" | "busy" | "rejected";
}

export interface PresentationWebSocketServer {
  readonly port: number;
  stop(): Promise<void>;
}

export function startPresentationWebSocketServer(options: {
  readonly authenticationTimeoutMs?: number;
  readonly eventStream: AssistantRuntimeEventStream;
  readonly handleControl?: (
    control: PresentationControl,
  ) => Promise<PresentationControlResult>;
  readonly port: number;
  readonly token: string;
}): Promise<PresentationWebSocketServer> {
  validateServerOptions(options);
  const server = new WebSocketServer({
    host: "127.0.0.1",
    maxPayload: maximumFrameBytes,
    port: options.port,
  });
  let activeClient: WebSocket | undefined;

  const unsubscribe = options.eventStream.subscribe((event) => {
    sendJson(activeClient, { event, protocolVersion, type: "event" });
  });

  server.on("connection", (socket) => {
    let authenticated = false;
    let controlWindowStartedAt = 0;
    let controlsInWindow = 0;
    const authenticationTimer = setTimeout(() => {
      if (!authenticated) closeWithError(socket, "authentication_required");
    }, options.authenticationTimeoutMs ?? 5_000);
    authenticationTimer.unref();

    socket.on("message", (raw, isBinary) => {
      if (isBinary) {
        closeWithError(socket, "invalid_message");
        return;
      }
      const parsed = parseJson(rawDataToText(raw));
      if (!authenticated) {
        const authentication = parseAuthentication(parsed);
        if (
          !authentication ||
          !tokensMatch(authentication.token, options.token)
        ) {
          clearTimeout(authenticationTimer);
          closeWithError(socket, "authentication_failed");
          return;
        }
        if (activeClient && activeClient.readyState === WebSocket.OPEN) {
          clearTimeout(authenticationTimer);
          closeWithError(socket, "client_already_connected");
          return;
        }
        authenticated = true;
        activeClient = socket;
        clearTimeout(authenticationTimer);
        const replay = authentication.cursor
          ? options.eventStream.readSince(authentication.cursor)
          : {
              kind: "snapshot" as const,
              snapshot: options.eventStream.snapshot(),
            };
        if (replay.kind === "snapshot") {
          sendJson(socket, {
            protocolVersion,
            snapshot: replay.snapshot,
            type: "snapshot",
          });
        } else {
          for (const event of replay.events) {
            sendJson(socket, { event, protocolVersion, type: "event" });
          }
        }
        return;
      }

      if (!withinControlRateLimit()) {
        sendError(socket, "rate_limited");
        return;
      }
      const control = parseControl(parsed);
      if (!control) {
        sendError(socket, "invalid_message");
        return;
      }
      void handleControl(socket, control, options.handleControl);
    });

    socket.on("close", () => {
      clearTimeout(authenticationTimer);
      if (activeClient === socket) activeClient = undefined;
    });

    function withinControlRateLimit(): boolean {
      const now = Date.now();
      if (now - controlWindowStartedAt >= 1_000) {
        controlWindowStartedAt = now;
        controlsInWindow = 0;
      }
      controlsInWindow += 1;
      return controlsInWindow <= maximumControlsPerSecond;
    }
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.once("listening", () => {
      server.off("error", reject);
      const address = server.address() as AddressInfo;
      resolve(
        Object.freeze({
          port: address.port,
          stop: () =>
            new Promise<void>((stopResolve, stopReject) => {
              unsubscribe();
              activeClient?.terminate();
              server.close((error) =>
                error ? stopReject(error) : stopResolve(),
              );
            }),
        }),
      );
    });
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

async function handleControl(
  socket: WebSocket,
  control: PresentationControl,
  handler:
    | ((control: PresentationControl) => Promise<PresentationControlResult>)
    | undefined,
): Promise<void> {
  try {
    const result = handler
      ? await handler(control)
      : {
          message: "Presentation controls are unavailable.",
          status: "rejected" as const,
        };
    sendJson(socket, {
      protocolVersion,
      requestId: control.requestId,
      ...result,
      type: "control_result",
    });
  } catch {
    sendJson(socket, {
      message: "The presentation control could not be completed.",
      protocolVersion,
      requestId: control.requestId,
      status: "rejected",
      type: "control_result",
    });
  }
}

function parseAuthentication(value: unknown):
  | {
      cursor?: { instanceId: string; sequence: number };
      token: string;
    }
  | undefined {
  if (
    !isRecord(value) ||
    value.protocolVersion !== protocolVersion ||
    value.type !== "authenticate" ||
    typeof value.token !== "string"
  ) {
    return;
  }
  if (value.cursor === undefined) return { token: value.token };
  if (
    !isRecord(value.cursor) ||
    !validIdentifier(value.cursor.instanceId) ||
    !Number.isInteger(value.cursor.sequence) ||
    (value.cursor.sequence as number) < 0
  ) {
    return;
  }
  return {
    cursor: {
      instanceId: value.cursor.instanceId as string,
      sequence: value.cursor.sequence as number,
    },
    token: value.token,
  };
}

function parseControl(value: unknown): PresentationControl | undefined {
  if (
    !isRecord(value) ||
    value.protocolVersion !== protocolVersion ||
    !validIdentifier(value.requestId) ||
    typeof value.type !== "string"
  ) {
    return;
  }
  if (value.type === "submit_text") {
    return typeof value.text === "string" &&
      value.text.length > 0 &&
      value.text.length <= maximumRequestCharacters &&
      !containsControlCharacters(value.text)
      ? {
          requestId: value.requestId as string,
          text: value.text,
          type: value.type,
        }
      : undefined;
  }
  if (value.type === "confirm" || value.type === "decline") {
    return validIdentifier(value.interactionId)
      ? {
          interactionId: value.interactionId as string,
          requestId: value.requestId as string,
          type: value.type,
        }
      : undefined;
  }
  if (value.type === "dismiss_overlay" || value.type === "stop_listening") {
    return { requestId: value.requestId as string, type: value.type };
  }
  return;
}

function validIdentifier(value: unknown): boolean {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maximumIdentifierCharacters &&
    !containsControlCharacters(value)
  );
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return;
  }
}

function rawDataToText(raw: RawData): string {
  if (Array.isArray(raw)) return Buffer.concat(raw).toString("utf8");
  if (raw instanceof ArrayBuffer) return Buffer.from(raw).toString("utf8");
  return Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength).toString(
    "utf8",
  );
}

function tokensMatch(candidate: string, expected: string): boolean {
  const candidateHash = createHash("sha256").update(candidate).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(candidateHash, expectedHash);
}

function closeWithError(socket: WebSocket, code: ErrorCode): void {
  sendError(socket, code);
  socket.close(4_400, code);
}

type ErrorCode =
  | "authentication_failed"
  | "authentication_required"
  | "client_already_connected"
  | "invalid_message"
  | "rate_limited";

function sendError(socket: WebSocket, code: ErrorCode): void {
  const messages: Record<ErrorCode, string> = {
    authentication_failed: "Presentation authentication failed.",
    authentication_required: "Presentation authentication is required.",
    client_already_connected: "A presentation client is already connected.",
    invalid_message: "Presentation message was invalid.",
    rate_limited: "Presentation controls are temporarily rate limited.",
  };
  sendJson(socket, {
    code,
    message: messages[code],
    protocolVersion,
    type: "error",
  });
}

function sendJson(socket: WebSocket | undefined, value: unknown): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
