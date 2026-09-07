import { createVoiceActivationDependencies } from "../../test-support/voice-runtime.js";
import { runVoiceActivation } from "./voice-activation.js";
import { createDesktopVoiceConfig } from "../../test-support/desktop-voice-runtime.js";
import { createServiceSignalController } from "../../test-support/service-runtime.js";
import { runDesktopVoiceServiceRuntime } from "./desktop-voice-service-runtime.js";
import { createVoiceTurnController } from "./voice-turn-controller.js";
import { createAssistantRuntimeEventStream } from "../presentation/assistant-runtime-event-stream.js";
import { createPresentationInteractionCoordinator } from "../presentation/presentation-interaction-coordinator.js";
import { createPresentationControlHandler } from "../presentation/presentation-control-handler.js";

describe("bounded voice barge-in", () => {
  it("joins simultaneous prompt capture before a desktop confirmation executes", async () => {
    const controller = createVoiceTurnController();
    const eventStream = createAssistantRuntimeEventStream({
      instanceId: "race",
      now: () => new Date("2026-09-07T12:00:00Z"),
    });
    const presentation = createPresentationInteractionCoordinator({
      createInteractionId: () => "interaction",
      publish: eventStream.publish.bind(eventStream),
    });
    const order: string[] = [];
    const assistant = {
      handleText: vi.fn(),
      handleTextWithDiagnostics: (text: string) => {
        order.push(text);
        return Promise.resolve({
          response:
            text === "yes"
              ? { status: "ok" as const, text: "Done." }
              : { status: "needs_confirmation" as const, text: "Approve?" },
        });
      },
    };
    let captures = 0;
    const turn = runVoiceActivation(
      {
        ...createVoiceActivationDependencies({
          assistant,
          wakeUtterance: "Hey Jarvis",
        }),
        bargeIn: { inputIsolation: "headphones" },
        turnController: controller,
        commandAudioInput: {
          capture: (options) => {
            captures += 1;
            if (captures === 1)
              return Promise.resolve({ text: "prepare action" });
            return new Promise((resolve) =>
              options?.signal?.addEventListener(
                "abort",
                () => {
                  order.push("capture stopped");
                  resolve({ text: "Hey Jarvis, yes" });
                },
                { once: true },
              ),
            );
          },
        },
        audioOutput: {
          play: (_speech, options) =>
            new Promise<void>((resolve) =>
              options?.signal?.addEventListener("abort", () => resolve(), {
                once: true,
              }),
            ),
        },
      },
      { presentation },
    );
    await vi.waitUntil(() => captures === 2);
    expect(eventStream.snapshot().microphone).toBe("capturing");
    const handle = createPresentationControlHandler({
      assistant,
      eventStream,
      presentation,
      interruptTurn: () => controller.cancel(),
    });
    await handle({
      type: "confirm",
      requestId: "confirm",
      confirmationSequence:
        eventStream.snapshot().interaction!.confirmation!.sequence,
      interactionId: "interaction",
    });
    expect((await turn).interruption).toBeUndefined();
    expect(order).toEqual(["prepare action", "capture stopped", "yes"]);
    expect(controller.failed).toBe(false);
    expect(eventStream.snapshot().interaction?.phase).toBe("completed");
  });
  it.each(["stop", "List my alarms"])(
    "captures %s during speech with one microphone owner",
    async (request) => {
      let playing = () => {};
      const speechStarted = new Promise<void>((resolve) => {
        playing = resolve;
      });
      let captures = 0;
      let activeCaptures = 0;
      let maximumCaptures = 0;
      const handledTexts: string[] = [];
      const dependencies = createVoiceActivationDependencies({
        handledTexts,
        wakeUtterance: "Hey Jarvis",
      });
      const result = await runVoiceActivation({
        ...dependencies,
        bargeIn: { inputIsolation: "headphones" },
        timing: { nowMs: () => 100 },
        commandAudioInput: {
          capture: async () => {
            activeCaptures += 1;
            maximumCaptures = Math.max(maximumCaptures, activeCaptures);
            captures += 1;
            try {
              if (captures === 1) return { text: "initial command" };
              await speechStarted;
              return { text: `Hey Jarvis, ${request}` };
            } finally {
              activeCaptures -= 1;
            }
          },
        },
        audioOutput: {
          play: (_speech, options) => {
            playing();
            return new Promise<void>((resolve) =>
              options?.signal?.addEventListener("abort", () => resolve(), {
                once: true,
              }),
            );
          },
        },
      });
      expect(result.status).toBe("cancelled");
      expect(handledTexts).toEqual(["initial command"]);
      expect(maximumCaptures).toBe(1);
      expect(captures).toBe(2);
      expect(result.interruption?.text).toBe(
        request === "stop" ? undefined : request,
      );
      expect(result.timings?.events).toEqual(
        expect.arrayContaining([
          {
            name:
              request === "stop" ? "stop_recognized" : "barge_in_recognized",
            offsetMs: 0,
          },
          { name: "output_stopped", offsetMs: 0 },
        ]),
      );
    },
  );

  it("hands the exact replacement to the next activation once", async () => {
    const signals = createServiceSignalController();
    let activations = 0;
    const observed: unknown[] = [];
    const timing = { nowMs: () => 100 };
    const result = await runDesktopVoiceServiceRuntime({
      config: createDesktopVoiceConfig("list alarms"),
      processSignals: signals,
      timing,
      runVoiceActivation: (dependencies) => {
        expect(dependencies.timing).toBe(timing);
        activations += 1;
        observed.push(dependencies.initialCommand);
        if (activations === 1)
          return Promise.resolve({
            status: "cancelled",
            textOutputWritten: false,
            response: { status: "ok", text: "Stopped." },
            interruption: { text: "List my alarms", wakePhrase: "hey jarvis" },
          });
        signals.emit("SIGTERM");
        return Promise.resolve({
          status: "spoken",
          textOutputWritten: false,
          response: { status: "ok", text: "Done." },
        });
      },
    });
    expect(result.status).toBe("stopped");
    expect(observed).toEqual([
      undefined,
      { text: "List my alarms", wakePhrase: "hey jarvis" },
    ]);
  });
});
