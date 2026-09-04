import type { AssistantResponse } from "../../ports/assistant.js";
import type {
  AssistantRuntimeEvent,
  PendingAssistantRuntimeEvent,
} from "./assistant-runtime-event-stream.js";

export interface PresentationEventPublisher {
  createInteractionId(): string;
  publish(event: PendingAssistantRuntimeEvent): AssistantRuntimeEvent;
}

export interface PresentationInteraction {
  completed(): void;
  confirmation(prompt: string): void;
  failed(message: string): void;
  followUpListening(): void;
  processing(): void;
  response(response: AssistantResponse): void;
  speakingFinished(): void;
  speakingStarted(): void;
  transcriptDelta(delta: string): void;
  transcriptFinal(text: string): void;
}

export interface PresentationInteractionCoordinator {
  beginInteraction(): PresentationInteraction;
  wakeListening(): void;
}

type PendingInteractionEvent = PendingAssistantRuntimeEvent extends infer TEvent
  ? TEvent extends { interactionId: string }
    ? Omit<TEvent, "interactionId">
    : never
  : never;

const noOperation = (): void => {};
const noOpInteraction: PresentationInteraction = Object.freeze({
  completed: noOperation,
  confirmation: noOperation,
  failed: noOperation,
  followUpListening: noOperation,
  processing: noOperation,
  response: noOperation,
  speakingFinished: noOperation,
  speakingStarted: noOperation,
  transcriptDelta: noOperation,
  transcriptFinal: noOperation,
});

export function createPresentationInteractionCoordinator(
  publisher?: PresentationEventPublisher,
): PresentationInteractionCoordinator {
  if (!publisher) {
    return Object.freeze({
      beginInteraction: () => noOpInteraction,
      wakeListening: noOperation,
    });
  }

  return Object.freeze({
    beginInteraction: () => createInteraction(publisher),
    wakeListening: () => publisher.publish({ type: "wake_listening" }),
  });
}

function createInteraction(
  publisher: PresentationEventPublisher,
): PresentationInteraction {
  const interactionId = publisher.createInteractionId();
  publisher.publish({ interactionId, type: "wake_detected" });

  const publish = (event: PendingInteractionEvent): void => {
    publisher.publish({ ...event, interactionId });
  };

  const interaction: PresentationInteraction = {
    completed: () => publish({ type: "completed" }),
    confirmation: (prompt) =>
      publish({ prompt, type: "confirmation_required" }),
    failed: (message) => publish({ message, type: "safe_failure" }),
    followUpListening: () => publish({ type: "follow_up_listening" }),
    processing: () => publish({ type: "processing" }),
    response: (response) =>
      publish({
        ...(response.citations ? { citations: response.citations } : {}),
        status: response.status,
        text: response.text,
        type: "response_ready",
      }),
    speakingFinished: () => publish({ type: "speaking_finished" }),
    speakingStarted: () => publish({ type: "speaking_started" }),
    transcriptDelta: (delta) => publish({ delta, type: "transcript_delta" }),
    transcriptFinal: (text) => publish({ text, type: "transcript_final" }),
  };
  return Object.freeze(interaction);
}
