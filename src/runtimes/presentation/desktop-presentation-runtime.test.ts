import type { Assistant } from "../../core/assistant/index.js";
import { emptyAssistantPresentationProjection } from "../../application/presentation-projection.js";
import { createLoadedRuntimeConfig } from "../../test-support/core-assistant.js";
import { createRuntimeServiceRegistry } from "../runtime-service-registry.js";
import { createDesktopPresentationRuntime } from "./desktop-presentation-runtime.js";
import type { startPresentationWebSocketServer } from "./presentation-websocket-server.js";

const token = "a-secure-presentation-token-with-32-characters";

describe("desktop presentation runtime", () => {
  it("stays disabled unless a presentation token is explicitly configured", async () => {
    const startServer = vi.fn();
    const runtime = createDesktopPresentationRuntime({
      env: {},
      now: () => new Date("2026-09-04T10:00:00.000Z"),
      startServer,
    });

    await runtime.start(createAssistant([]));
    await runtime.stop();

    expect(runtime.presentation).toBeUndefined();
    expect(startServer).not.toHaveBeenCalled();
  });

  it("starts authenticated loopback presentation and routes exact controls", async () => {
    const handled: string[] = [];
    const stop = vi.fn(() => Promise.resolve());
    const startServer = vi.fn(
      (options: Parameters<typeof startPresentationWebSocketServer>[0]) =>
        Promise.resolve({ port: options.port, stop }),
    );
    const runtime = createDesktopPresentationRuntime({
      createInstanceId: () => "desktop-service-1",
      env: {
        PERSONAL_AI_PRESENTATION_PORT: "43119",
        PERSONAL_AI_PRESENTATION_TOKEN: token,
      },
      now: () => new Date("2026-09-04T10:00:00.000Z"),
      startServer,
    });
    const assistant = createAssistant(handled);

    await runtime.start(assistant);
    const serverOptions = startServer.mock.calls[0]?.[0];
    await serverOptions?.handleControl?.({
      requestId: "request-1",
      text: "Hello",
      type: "submit_text",
    });
    await runtime.stop();

    expect(startServer).toHaveBeenCalledWith(
      expect.objectContaining({ port: 43_119, token }),
    );
    expect(handled).toEqual(["Hello"]);
    expect(stop).toHaveBeenCalledOnce();
  });

  it("rejects malformed configured ports before opening transport", async () => {
    const startServer = vi.fn();
    const runtime = createDesktopPresentationRuntime({
      env: {
        PERSONAL_AI_PRESENTATION_PORT: "70000",
        PERSONAL_AI_PRESENTATION_TOKEN: token,
      },
      now: () => new Date("2026-09-04T10:00:00.000Z"),
      startServer,
    });

    await expect(runtime.start(createAssistant([]))).rejects.toThrow(
      "Presentation port",
    );
    expect(startServer).not.toHaveBeenCalled();
  });

  it("serially refreshes live command projections after background changes", async () => {
    let today = "Initial view";
    let refresh: (() => void) | undefined;
    const timer = setInterval(() => {}, 60_000);
    const startServer = vi.fn(
      (options: Parameters<typeof startPresentationWebSocketServer>[0]) =>
        Promise.resolve({ port: options.port, stop: () => Promise.resolve() }),
    );
    const readProjection = vi.fn(() =>
      Promise.resolve({
        ...emptyAssistantPresentationProjection,
        today: [today],
      }),
    );
    const runtime = createDesktopPresentationRuntime({
      clearRefreshTimer: clearInterval,
      env: { PERSONAL_AI_PRESENTATION_TOKEN: token },
      now: () => new Date("2026-09-04T10:00:00.000Z"),
      readProjection,
      setRefreshTimer: (callback) => {
        refresh = callback;
        return timer;
      },
      startServer,
    });

    await runtime.start(createAssistant([]), {
      config: createLoadedRuntimeConfig({}),
      services: createRuntimeServiceRegistry([]),
    });
    const serverOptions = startServer.mock.calls[0]?.[0];
    expect(serverOptions?.projectionStream?.snapshot().today).toEqual([
      "Initial view",
    ]);
    today = "Background update";
    refresh?.();
    await vi.waitFor(() => expect(readProjection).toHaveBeenCalledTimes(2));
    await vi.waitFor(() =>
      expect(serverOptions?.projectionStream?.snapshot().today).toEqual([
        "Background update",
      ]),
    );

    await runtime.stop();
  });
});

function createAssistant(handled: string[]): Assistant {
  return {
    handleText: (text) =>
      Promise.resolve({ status: "ok", text: `Handled ${text}` }),
    handleTextWithDiagnostics: (text) => {
      handled.push(text);
      return Promise.resolve({
        response: { status: "ok", text: `Handled ${text}` },
      });
    },
  };
}
