import type { Assistant } from "../../core/assistant/index.js";
import { createAssistantRuntimeEventStream } from "./assistant-runtime-event-stream.js";
import { createPresentationControlHandler } from "./presentation-control-handler.js";
import { createPresentationInteractionCoordinator } from "./presentation-interaction-coordinator.js";

describe("presentation control handler", () => {
  it("resumes the exact validated pending confirmation", async () => {
    const handled: string[] = [];
    const assistant = createAssistant(handled);
    const eventStream = createStream();
    const coordinator = createCoordinator(eventStream);
    const interaction = coordinator.beginInteraction();
    interaction.processing();
    interaction.confirmation("Send the exact message?");
    const interactionId = eventStream.snapshot().interaction?.id;
    const handle = createPresentationControlHandler({
      assistant,
      eventStream,
      presentation: coordinator,
    });

    const result = await handle({
      interactionId: interactionId ?? "missing",
      requestId: "request-1",
      type: "confirm",
    });

    expect(result).toEqual({ status: "accepted" });
    expect(handled).toEqual(["yes"]);
    expect(eventStream.snapshot().interaction).toMatchObject({
      id: interactionId,
      phase: "completed",
      response: { text: "Handled yes" },
    });
  });

  it("rejects stale confirmation identifiers without calling the assistant", async () => {
    const handled: string[] = [];
    const eventStream = createStream();
    const coordinator = createCoordinator(eventStream);
    const interaction = coordinator.beginInteraction();
    interaction.processing();
    interaction.confirmation("Approve?");
    const handle = createPresentationControlHandler({
      assistant: createAssistant(handled),
      eventStream,
      presentation: coordinator,
    });

    const result = await handle({
      interactionId: "stale-interaction",
      requestId: "request-2",
      type: "decline",
    });

    expect(result).toEqual({
      message: "That confirmation is no longer pending.",
      status: "rejected",
    });
    expect(handled).toEqual([]);
  });

  it("runs bounded typed requests and rejects unavailable interruption", async () => {
    const handled: string[] = [];
    const eventStream = createStream();
    const handle = createPresentationControlHandler({
      assistant: createAssistant(handled),
      eventStream,
      presentation: createCoordinator(eventStream),
    });

    await expect(
      handle({ requestId: "request-3", text: "Hello", type: "submit_text" }),
    ).resolves.toEqual({ status: "accepted" });
    await expect(
      handle({ requestId: "request-4", type: "stop_listening" }),
    ).resolves.toEqual({
      message: "Voice interruption is not available yet.",
      status: "rejected",
    });
    expect(handled).toEqual(["Hello"]);
  });
});

function createStream() {
  return createAssistantRuntimeEventStream({
    instanceId: "service-1",
    now: () => new Date("2026-09-04T10:00:00.000Z"),
  });
}

function createCoordinator(eventStream: ReturnType<typeof createStream>) {
  return createPresentationInteractionCoordinator({
    createInteractionId: () => "interaction-1",
    publish: (event) => eventStream.publish(event),
  });
}

function createAssistant(handled: string[]): Assistant {
  return {
    handleText: (text) => {
      handled.push(text);
      return Promise.resolve({ status: "ok", text: `Handled ${text}` });
    },
    handleTextWithDiagnostics: (text) => {
      handled.push(text);
      return Promise.resolve({
        response: { status: "ok", text: `Handled ${text}` },
      });
    },
  };
}
