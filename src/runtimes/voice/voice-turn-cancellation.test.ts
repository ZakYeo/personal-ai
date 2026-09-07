import type { AssistantResponse } from "../../ports/assistant.js";
import {
  createVoiceActivationDependencies,
  createCapturedWriter,
} from "../../test-support/voice-runtime.js";
import { createAssistantRuntimeEventStream } from "../presentation/assistant-runtime-event-stream.js";
import { createPresentationInteractionCoordinator } from "../presentation/presentation-interaction-coordinator.js";
import { runVoiceActivation } from "./voice-activation.js";
import { createVoiceTurnController } from "./voice-turn-controller.js";

describe("voice turn cancellation", () => {
  it("ignores transcript deltas arriving during cancellation cleanup", async () => {
    const controller = createVoiceTurnController();
    const progressOutput = createCapturedWriter();
    const entered = vi.fn();
    const stream = createAssistantRuntimeEventStream({
      instanceId: "service-1",
      now: () => new Date("2026-09-07T12:00:00Z"),
    });
    const presentation = createPresentationInteractionCoordinator({
      createInteractionId: () => "turn-1",
      publish: (event) => stream.publish(event),
    });
    const result = runVoiceActivation(
      {
        ...createVoiceActivationDependencies(),
        turnController: controller,
        streamingInput: {
          audioInput: {
            captureStream: () =>
              Promise.resolve({
                chunks: (async function* () {
                  await Promise.resolve();
                  yield new Uint8Array([1, 2]);
                })(),
              }),
          },
          speechToText: {
            transcribeStream: (_audio, events, options) => {
              entered();
              return new Promise((resolve) =>
                options?.signal?.addEventListener(
                  "abort",
                  () => {
                    events?.onTranscriptDelta?.("late transcript");
                    resolve({ text: "late transcript" });
                  },
                  { once: true },
                ),
              );
            },
          },
        },
      },
      { progressOutput, presentation },
    );
    await vi.waitUntil(() => entered.mock.calls.length === 1);
    await controller.cancel();
    await result;
    expect(progressOutput.writes.join("")).not.toContain("late transcript");
    expect(stream.snapshot().interaction?.transcript).toBe("");
  });

  it.each([
    "capture",
    "transcription",
    "assistant",
    "synthesis",
    "playback",
  ] as const)(
    "stops during %s without fallback or a late response",
    async (phase) => {
      const controller = createVoiceTurnController();
      const entered = vi.fn();
      const service = new AbortController();
      const fallbackOutput = createCapturedWriter();
      const response: AssistantResponse = {
        status: "ok",
        text: "Late answer.",
      };
      const pause = <T>(
        signal: AbortSignal | undefined,
        value: T,
      ): Promise<T> => {
        if (!signal) throw new Error("Cancellation signal missing");
        entered();
        return new Promise((resolve) =>
          signal.addEventListener("abort", () => resolve(value), {
            once: true,
          }),
        );
      };
      const result = runVoiceActivation(
        {
          ...createVoiceActivationDependencies(),
          shutdownSignal: service.signal,
          turnController: controller,
          wakeActivation: {
            waitForWake: () => Promise.resolve({ phrase: "hey jarvis" }),
          },
          commandAudioInput: {
            capture: (options) =>
              phase === "capture"
                ? pause(options?.signal, { text: "list alarms" })
                : Promise.resolve({ text: "list alarms" }),
          },
          speechToText: {
            transcribe: (audio, options) =>
              phase === "transcription"
                ? pause(options?.signal, { text: audio.text })
                : Promise.resolve({ text: audio.text }),
          },
          assistant: {
            handleText: vi.fn(),
            handleTextWithDiagnostics: (_text, options) =>
              phase === "assistant"
                ? pause(options?.signal, { response })
                : Promise.resolve({ response }),
          },
          textToSpeech: {
            synthesize: (text, options) =>
              phase === "synthesis"
                ? pause(options?.signal, { text })
                : Promise.resolve({ text }),
          },
          audioOutput: {
            play: (_speech, options) =>
              phase === "playback"
                ? pause(options?.signal, undefined)
                : Promise.resolve(),
          },
        },
        { fallbackOutput },
      );
      await vi.waitUntil(() => entered.mock.calls.length === 1);
      await controller.cancel();
      await expect(result).resolves.toMatchObject({
        status: "cancelled",
        textOutputWritten: false,
      });
      expect(fallbackOutput.writes).toEqual([]);
      expect(service.signal.aborted).toBe(false);
    },
  );

  it.each([false, true])(
    "preserves a follow-up prompt or its claimed UI continuation: %s",
    async (claimedByUi) => {
      const controller = createVoiceTurnController();
      const stream = createAssistantRuntimeEventStream({
        instanceId: "service-1",
        now: () => new Date("2026-09-07T12:00:00Z"),
      });
      const presentation = createPresentationInteractionCoordinator({
        createInteractionId: () => "turn-1",
        publish: (event) => stream.publish(event),
      });
      const response: AssistantResponse = {
        status: "needs_confirmation",
        expectsFollowUp: true,
        text: "Confirm the exact action?",
      };
      let captures = 0;
      const result = runVoiceActivation(
        {
          ...createVoiceActivationDependencies({
            assistant: {
              handleText: () => Promise.resolve(response),
              handleTextWithDiagnostics: () => Promise.resolve({ response }),
            },
          }),
          turnController: controller,
          commandAudioInput: {
            capture: (options) => {
              captures += 1;
              return captures === 1
                ? Promise.resolve({ text: "do that" })
                : new Promise((resolve) =>
                    options?.signal?.addEventListener(
                      "abort",
                      () => resolve({ text: "late reply" }),
                      { once: true },
                    ),
                  );
            },
          },
        },
        { presentation },
      );
      await vi.waitUntil(() => captures === 2);
      const ui = presentation.continueInteraction("turn-1");
      if (claimedByUi) {
        ui.claimContinuation();
        ui.processing();
      }
      await controller.cancel();
      await expect(result).resolves.toMatchObject({ status: "cancelled" });
      expect(stream.snapshot().interaction?.phase).toBe(
        claimedByUi ? "processing" : "confirmation",
      );
    },
  );
});
