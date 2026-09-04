import WebSocket, { type RawData } from "ws";
import { createAssistantRuntimeEventStream } from "./assistant-runtime-event-stream.js";
import { startPresentationWebSocketServer } from "./presentation-websocket-server.js";
import { createPresentationProjectionStream } from "./presentation-projection-stream.js";
import { emptyAssistantPresentationProjection } from "../../application/presentation-projection.js";

const token = "a-secure-presentation-token-with-32-characters";

describe("presentation websocket server", () => {
  it("authenticates before returning a snapshot and streams later events", async () => {
    const stream = createStream();
    const projections = createPresentationProjectionStream();
    const server = await startPresentationWebSocketServer({
      authenticationTimeoutMs: 100,
      eventStream: stream,
      port: 0,
      projectionStream: projections,
      token,
    });
    const client = new WebSocket(`ws://127.0.0.1:${server.port}`);
    const messages = collectMessages(client);
    await opened(client);

    client.send(
      JSON.stringify({ protocolVersion: 1, token, type: "authenticate" }),
    );
    expect(await messages.next()).toMatchObject({
      protocolVersion: 1,
      snapshot: { instanceId: "service-1", sequence: 0 },
      type: "snapshot",
    });
    expect(await messages.next()).toMatchObject({
      projection: { alarms: [], tasks: [] },
      type: "projection",
    });

    projections.update({
      ...emptyAssistantPresentationProjection,
      today: ["Review notes"],
    });
    expect(await messages.next()).toMatchObject({
      projection: { today: ["Review notes"] },
      type: "projection",
    });

    stream.publish({ type: "wake_listening" });
    expect(await messages.next()).toMatchObject({
      event: { sequence: 1, type: "wake_listening" },
      protocolVersion: 1,
      type: "event",
    });

    client.close();
    await server.stop();
  });

  it("rejects bad authentication without exposing state", async () => {
    const server = await startPresentationWebSocketServer({
      authenticationTimeoutMs: 100,
      eventStream: createStream(),
      port: 0,
      token,
    });
    const client = new WebSocket(`ws://127.0.0.1:${server.port}`);
    const messages = collectMessages(client);
    await opened(client);
    client.send(
      JSON.stringify({
        protocolVersion: 1,
        token: "wrong-token-that-is-still-long-enough",
        type: "authenticate",
      }),
    );

    expect(await messages.next()).toEqual({
      code: "authentication_failed",
      message: "Presentation authentication failed.",
      protocolVersion: 1,
      type: "error",
    });
    await closed(client);
    await server.stop();
  });

  it("allows only one authenticated presentation client", async () => {
    const server = await startPresentationWebSocketServer({
      authenticationTimeoutMs: 100,
      eventStream: createStream(),
      port: 0,
      token,
    });
    const first = await authenticatedClient(server.port);
    const second = new WebSocket(`ws://127.0.0.1:${server.port}`);
    const messages = collectMessages(second);
    await opened(second);
    second.send(
      JSON.stringify({ protocolVersion: 1, token, type: "authenticate" }),
    );

    expect(await messages.next()).toMatchObject({
      code: "client_already_connected",
      type: "error",
    });
    await closed(second);
    first.close();
    await server.stop();
  });

  it("parses bounded controls and returns their safe result", async () => {
    const controls: unknown[] = [];
    const server = await startPresentationWebSocketServer({
      authenticationTimeoutMs: 100,
      eventStream: createStream(),
      handleControl: (control) => {
        controls.push(control);
        return Promise.resolve({ status: "accepted" });
      },
      port: 0,
      token,
    });
    const client = await authenticatedClient(server.port);
    const messages = collectMessages(client);
    client.send(
      JSON.stringify({
        protocolVersion: 1,
        requestId: "request-1",
        text: "list my alarms",
        type: "submit_text",
      }),
    );

    expect(await messages.next()).toEqual({
      protocolVersion: 1,
      requestId: "request-1",
      status: "accepted",
      type: "control_result",
    });
    expect(controls).toEqual([
      { requestId: "request-1", text: "list my alarms", type: "submit_text" },
    ]);
    client.close();
    await server.stop();
  });

  it("rejects controls with undeclared fields", async () => {
    const controls: unknown[] = [];
    const server = await startPresentationWebSocketServer({
      authenticationTimeoutMs: 100,
      eventStream: createStream(),
      handleControl: (control) => {
        controls.push(control);
        return Promise.resolve({ status: "accepted" });
      },
      port: 0,
      token,
    });
    const client = await authenticatedClient(server.port);
    const messages = collectMessages(client);
    client.send(
      JSON.stringify({
        diagnostics: "private",
        protocolVersion: 1,
        requestId: "request-1",
        text: "list my alarms",
        type: "submit_text",
      }),
    );

    expect(await messages.next()).toMatchObject({
      code: "invalid_message",
      type: "error",
    });
    expect(controls).toEqual([]);
    client.close();
    await server.stop();
  });

  it("serializes controls from the authenticated client", async () => {
    const started: string[] = [];
    let finishFirst: (() => void) | undefined;
    const firstFinished = new Promise<void>((resolve) => {
      finishFirst = resolve;
    });
    const server = await startPresentationWebSocketServer({
      authenticationTimeoutMs: 100,
      eventStream: createStream(),
      handleControl: async (control) => {
        started.push(control.requestId);
        if (control.requestId === "request-1") await firstFinished;
        return { status: "accepted" };
      },
      port: 0,
      token,
    });
    const client = await authenticatedClient(server.port);
    const messages = collectMessages(client);
    client.send(controlMessage("request-1"));
    client.send(controlMessage("request-2"));
    await vi.waitFor(() => expect(started).toEqual(["request-1"]));

    finishFirst?.();
    await messages.next();
    await messages.next();
    expect(started).toEqual(["request-1", "request-2"]);

    client.close();
    await server.stop();
  });

  it("reports control boundary failures while returning only a safe result", async () => {
    const reportFailure = vi.fn();
    const server = await startPresentationWebSocketServer({
      authenticationTimeoutMs: 100,
      eventStream: createStream(),
      handleControl: () => Promise.reject(new Error("private adapter failure")),
      port: 0,
      reportFailure,
      token,
    });
    const client = await authenticatedClient(server.port);
    const messages = collectMessages(client);
    client.send(controlMessage("request-1"));

    expect(await messages.next()).toEqual({
      message: "The presentation control could not be completed.",
      protocolVersion: 1,
      requestId: "request-1",
      status: "rejected",
      type: "control_result",
    });
    expect(reportFailure).toHaveBeenCalledWith(
      expect.objectContaining({ message: "private adapter failure" }),
    );

    client.close();
    await server.stop();
  });

  it("closes unauthenticated clients during shutdown", async () => {
    const server = await startPresentationWebSocketServer({
      authenticationTimeoutMs: 5_000,
      eventStream: createStream(),
      port: 0,
      token,
    });
    const client = new WebSocket(`ws://127.0.0.1:${server.port}`);
    await opened(client);

    const close = closed(client);
    await server.stop();
    await close;
    expect(client.readyState).toBe(WebSocket.CLOSED);
  });
});

function controlMessage(requestId: string): string {
  return JSON.stringify({
    protocolVersion: 1,
    requestId,
    text: "list my alarms",
    type: "submit_text",
  });
}

function createStream() {
  return createAssistantRuntimeEventStream({
    instanceId: "service-1",
    now: () => new Date("2026-09-04T10:00:00.000Z"),
  });
}

async function authenticatedClient(port: number): Promise<WebSocket> {
  const client = new WebSocket(`ws://127.0.0.1:${port}`);
  const messages = collectMessages(client);
  await opened(client);
  client.send(
    JSON.stringify({ protocolVersion: 1, token, type: "authenticate" }),
  );
  await messages.next();
  await messages.next();
  return client;
}

function collectMessages(client: WebSocket) {
  const pending: Array<(message: unknown) => void> = [];
  const queued: unknown[] = [];
  client.on("message", (raw) => {
    const message: unknown = JSON.parse(rawDataToText(raw));
    const resolve = pending.shift();
    if (resolve) resolve(message);
    else queued.push(message);
  });
  return {
    next: () => {
      const message = queued.shift();
      return message === undefined
        ? new Promise<unknown>((resolve) => pending.push(resolve))
        : Promise.resolve(message);
    },
  };
}

function rawDataToText(raw: RawData): string {
  if (Array.isArray(raw)) return Buffer.concat(raw).toString("utf8");
  if (raw instanceof ArrayBuffer) return Buffer.from(raw).toString("utf8");
  return Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength).toString(
    "utf8",
  );
}

function opened(client: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    client.once("open", resolve);
    client.once("error", reject);
  });
}

function closed(client: WebSocket): Promise<void> {
  if (client.readyState === WebSocket.CLOSED) return Promise.resolve();
  return new Promise((resolve) => client.once("close", resolve));
}
