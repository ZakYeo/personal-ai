import { createAssistantRuntimeEventStream } from "./assistant-runtime-event-stream.js";
import type {
  AssistantRuntimeEvent,
  PendingAssistantRuntimeEvent,
} from "./assistant-runtime-event-stream.js";
import { createPresentationInteractionCoordinator } from "./presentation-interaction-coordinator.js";

describe("presentation interaction coordinator", () => {
  it("owns interaction identity and semantic event publication", () => {
    const stream = createAssistantRuntimeEventStream({
      instanceId: "service-1",
      now: () => new Date("2026-09-04T10:00:00.000Z"),
    });
    const coordinator = createPresentationInteractionCoordinator({
      createInteractionId: () => "interaction-1",
      publish: (event) => stream.publish(event),
    });

    coordinator.wakeListening();
    const interaction = coordinator.beginInteraction();
    interaction.transcriptFinal("list my alarms");
    interaction.processing();
    interaction.response({ status: "ok", text: "No alarms are set." });
    interaction.speakingStarted();
    interaction.speakingFinished();
    interaction.completed();

    expect(stream.snapshot()).toMatchObject({
      interaction: {
        id: "interaction-1",
        phase: "completed",
        transcript: "list my alarms",
      },
      sequence: 8,
    });
  });

  it("provides a no-op boundary when presentation is disabled", () => {
    const coordinator = createPresentationInteractionCoordinator();

    expect(() => {
      coordinator.wakeListening();
      coordinator.continueInteraction("existing").processing();
      const interaction = coordinator.beginInteraction();
      interaction.processing();
      interaction.failed("Unavailable.");
    }).not.toThrow();
  });

  it("continues an existing interaction without inventing a second wake", () => {
    const publish = vi.fn(
      (event: PendingAssistantRuntimeEvent): AssistantRuntimeEvent => {
        void event;
        return {
          occurredAt: "2026-09-04T10:00:00.000Z",
          sequence: 1,
          type: "wake_listening",
        };
      },
    );
    const coordinator = createPresentationInteractionCoordinator({
      createInteractionId: () => "new-interaction",
      publish,
    });

    coordinator.continueInteraction("pending-interaction").processing();

    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith({
      interactionId: "pending-interaction",
      type: "processing",
    });
  });
});
