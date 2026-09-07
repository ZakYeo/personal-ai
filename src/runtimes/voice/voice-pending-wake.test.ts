import { createPresentationControlHandler } from "../presentation/presentation-control-handler.js";
import {
  createAssistantHarness,
  createFeature,
  createCommand,
  requireConfirmationFor,
} from "../../test-support/core-assistant.js";
import { createVoiceActivationDependencies } from "../../test-support/voice-runtime.js";
import { createAssistantRuntimeEventStream } from "../presentation/assistant-runtime-event-stream.js";
import { createPresentationInteractionCoordinator } from "../presentation/presentation-interaction-coordinator.js";
import { runVoiceActivation } from "./voice-activation.js";

describe("a later wake with a pending confirmation", () => {
  it("resumes the existing interaction and reports microphone capture accurately", async () => {
    const { dependencies, execute, presentation, stream, createdIds } =
      await createPendingVoiceHarness();
    const capture = dependencies.commandAudioInput.capture.bind(
      dependencies.commandAudioInput,
    );
    dependencies.commandAudioInput.capture = (options) => {
      expect(stream.snapshot()).toMatchObject({
        microphone: "capturing",
        wakeListening: false,
        interaction: {
          id: "interaction-1",
          phase: "listening",
          transcript: "",
        },
      });
      return capture(options);
    };
    await expect(
      runVoiceActivation(dependencies, { presentation }),
    ).resolves.toMatchObject({
      status: "spoken",
      response: { text: "Completed." },
    });
    expect(execute).toHaveBeenCalledOnce();
    expect(createdIds()).toBe(1);
    expect(stream.snapshot().interaction).toMatchObject({
      id: "interaction-1",
      phase: "completed",
    });
  });
  it("discards a captured voice reply after the UI claimed the confirmation", async () => {
    const { assistant, dependencies, execute, presentation, stream } =
      await createPendingVoiceHarness();
    const handle = createPresentationControlHandler({
      assistant,
      presentation,
      eventStream: stream,
    });
    dependencies.commandAudioInput.capture = async () => {
      await expect(
        handle({
          type: "confirm",
          interactionId: "interaction-1",
          requestId: "ui",
        }),
      ).resolves.toEqual({ status: "accepted" });
      return { text: "no" };
    };
    await expect(
      runVoiceActivation(dependencies, { presentation }),
    ).resolves.toMatchObject({ status: "cancelled" });
    expect(execute).toHaveBeenCalledOnce();
    expect(stream.snapshot().interaction).toMatchObject({
      phase: "completed",
      response: { text: "Completed." },
    });
  });
});

async function createPendingVoiceHarness() {
  const execute = vi.fn(() => Promise.resolve({ text: "Completed." }));
  const assistant = createAssistantHarness({
    features: [
      createFeature({
        execute,
        confirmation: () => ({ facts: {}, text: "perform the exact action" }),
      }),
    ],
    config: requireConfirmationFor("test", ["test.echo"]),
    interpretation: createCommand("test.echo"),
  });
  const prompt = await assistant.handleText("do it");
  const stream = createAssistantRuntimeEventStream({
    instanceId: "service",
    now: () => new Date("2026-09-07T10:00:00Z"),
  });
  let nextId = 0;
  const presentation = createPresentationInteractionCoordinator({
    createInteractionId: () => `interaction-${++nextId}`,
    publish: (event) => stream.publish(event),
  });
  const pending = presentation.beginInteraction();
  pending.transcriptFinal("do it");
  pending.processing();
  pending.confirmation(prompt.text);
  const dependencies = createVoiceActivationDependencies({
    assistant,
    wakeUtterance: "hey jarvis",
    commandUtterance: "yes",
  });
  return {
    assistant,
    dependencies,
    execute,
    presentation,
    stream,
    createdIds: () => nextId,
  };
}
