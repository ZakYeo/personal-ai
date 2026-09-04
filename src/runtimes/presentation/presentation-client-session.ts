import { createHash, timingSafeEqual } from "node:crypto";
import WebSocket, { type RawData } from "ws";
import {
  parsePresentationAuthentication,
  parsePresentationControl,
} from "../../application/presentation-protocol.js";
import {
  presentationProtocolVersion,
  type AssistantRuntimeEvent,
  type AssistantPresentationProjection,
  type PresentationControl,
  type PresentationControlResult,
} from "../../ports/presentation.js";
import type { AssistantRuntimeEventStream } from "./assistant-runtime-event-stream.js";
import type { PresentationProjectionStream } from "./presentation-projection-stream.js";

type ErrorCode =
  | "authentication_failed"
  | "authentication_required"
  | "client_already_connected"
  | "invalid_message"
  | "rate_limited";

export interface PresentationClientSession {
  close(): void;
  isAuthenticated(): boolean;
  sendEvent(event: AssistantRuntimeEvent): void;
  sendProjection(projection: AssistantPresentationProjection): void;
}

export function createPresentationClientSession(options: {
  readonly authenticationTimeoutMs: number;
  readonly clearTimer: (timer: NodeJS.Timeout) => void;
  readonly eventStream: AssistantRuntimeEventStream;
  readonly handleControl?: (
    control: PresentationControl,
  ) => Promise<PresentationControlResult>;
  readonly maximumControlsPerSecond: number;
  readonly now: () => number;
  readonly onAuthenticated: () => boolean;
  readonly onClosed: () => void;
  readonly projectionStream: PresentationProjectionStream;
  readonly reportFailure: (error: unknown) => void;
  readonly setTimer: (
    callback: () => void,
    milliseconds: number,
  ) => NodeJS.Timeout;
  readonly socket: WebSocket;
  readonly token: string;
}): PresentationClientSession {
  let authenticated = false;
  let controlWindowStartedAt = 0;
  let controlsInWindow = 0;
  let controlQueue = Promise.resolve();
  const authenticationTimer = options.setTimer(() => {
    if (!authenticated)
      closeWithError(options.socket, "authentication_required");
  }, options.authenticationTimeoutMs);
  authenticationTimer.unref();

  options.socket.on("message", (raw, isBinary) => {
    if (isBinary) return closeWithError(options.socket, "invalid_message");
    const parsed = parseJson(rawDataToText(raw));
    if (!authenticated) {
      authenticate(parsed);
      return;
    }
    receiveControl(parsed);
  });
  options.socket.on("close", () => {
    options.clearTimer(authenticationTimer);
    options.onClosed();
  });
  options.socket.on("error", options.reportFailure);

  function authenticate(value: unknown): void {
    const authentication = parsePresentationAuthentication(value);
    if (!authentication || !tokensMatch(authentication.token, options.token)) {
      options.clearTimer(authenticationTimer);
      closeWithError(options.socket, "authentication_failed");
      return;
    }
    if (!options.onAuthenticated()) {
      options.clearTimer(authenticationTimer);
      closeWithError(options.socket, "client_already_connected");
      return;
    }
    authenticated = true;
    options.clearTimer(authenticationTimer);
    const replay = authentication.cursor
      ? options.eventStream.readSince(authentication.cursor)
      : {
          kind: "snapshot" as const,
          snapshot: options.eventStream.snapshot(),
        };
    if (replay.kind === "snapshot") {
      sendJson(options.socket, {
        protocolVersion: presentationProtocolVersion,
        snapshot: replay.snapshot,
        type: "snapshot",
      });
    } else {
      for (const event of replay.events) sendEvent(event);
    }
    sendProjection(options.projectionStream.snapshot());
  }

  function receiveControl(value: unknown): void {
    if (!withinControlRateLimit()) {
      sendError(options.socket, "rate_limited");
      return;
    }
    const control = parsePresentationControl(value);
    if (!control) {
      sendError(options.socket, "invalid_message");
      return;
    }
    controlQueue = controlQueue.then(() =>
      handleControl(
        options.socket,
        control,
        options.handleControl,
        options.reportFailure,
      ),
    );
  }

  function withinControlRateLimit(): boolean {
    const now = options.now();
    if (now - controlWindowStartedAt >= 1_000) {
      controlWindowStartedAt = now;
      controlsInWindow = 0;
    }
    controlsInWindow += 1;
    return controlsInWindow <= options.maximumControlsPerSecond;
  }

  function sendEvent(event: AssistantRuntimeEvent): void {
    sendJson(options.socket, {
      event,
      protocolVersion: presentationProtocolVersion,
      type: "event",
    });
  }

  function sendProjection(projection: AssistantPresentationProjection): void {
    sendJson(options.socket, {
      projection,
      protocolVersion: presentationProtocolVersion,
      type: "projection",
    });
  }

  const session: PresentationClientSession = {
    close: () => options.socket.terminate(),
    isAuthenticated: () => authenticated,
    sendEvent,
    sendProjection,
  };
  return Object.freeze(session);
}

async function handleControl(
  socket: WebSocket,
  control: PresentationControl,
  handler:
    | ((control: PresentationControl) => Promise<PresentationControlResult>)
    | undefined,
  reportFailure: (error: unknown) => void,
): Promise<void> {
  try {
    const result = handler
      ? await handler(control)
      : {
          message: "Presentation controls are unavailable.",
          status: "rejected" as const,
        };
    sendJson(socket, {
      protocolVersion: presentationProtocolVersion,
      requestId: control.requestId,
      ...result,
      type: "control_result",
    });
  } catch (error) {
    reportFailure(error);
    sendJson(socket, {
      message: "The presentation control could not be completed.",
      protocolVersion: presentationProtocolVersion,
      requestId: control.requestId,
      status: "rejected",
      type: "control_result",
    });
  }
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
    protocolVersion: presentationProtocolVersion,
    type: "error",
  });
}

function sendJson(socket: WebSocket, value: unknown): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(value));
}
