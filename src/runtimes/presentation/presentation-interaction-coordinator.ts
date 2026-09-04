import type { AssistantResponse } from "../../ports/assistant.js";
import type {
  AssistantRuntimeEvent,
  PendingAssistantRuntimeEvent,
} from "./assistant-runtime-event-stream.js";

interface PresentationEventPublisher {
  createInteractionId(): string;
  publish(event: PendingAssistantRuntimeEvent): AssistantRuntimeEvent;
}

export interface PresentationInteraction {
  claimContinuation(): boolean;
  completed(): void;
  confirmation(prompt: string): void;
  continuationAvailable(): boolean;
  failed(message: string): void;
  followUpListening(): boolean;
  processing(): void;
  response(response: AssistantResponse): void;
  speakingFinished(): void;
  speakingStarted(): void;
  transcriptDelta(delta: string): void;
  transcriptFinal(text: string): void;
}

export interface PresentationInteractionCoordinator {
  beginInteraction(): PresentationInteraction;
  continueInteraction(interactionId: string): PresentationInteraction;
  wakeListening(): void;
}

type PendingInteractionEvent = PendingAssistantRuntimeEvent extends infer TEvent
  ? TEvent extends { interactionId: string }
    ? Omit<TEvent, "interactionId">
    : never
  : never;

const noOperation = (): void => {};
const noOpInteraction: PresentationInteraction = Object.freeze({
  claimContinuation: () => true,
  completed: noOperation,
  confirmation: noOperation,
  continuationAvailable: () => true,
  failed: noOperation,
  followUpListening: () => true,
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
      continueInteraction: () => noOpInteraction,
      wakeListening: noOperation,
    });
  }

  let pendingContinuationId: string | undefined;

  return Object.freeze({
    beginInteraction: () =>
      createInteraction(publisher, continuationOwner, undefined),
    continueInteraction: (interactionId: string) =>
      createInteraction(publisher, continuationOwner, interactionId),
    wakeListening: () => publisher.publish({ type: "wake_listening" }),
  });

  function continuationOwner(
    interactionId: string,
    action: "available" | "claim" | "open",
  ) {
    if (action === "open") {
      pendingContinuationId = interactionId;
      return true;
    }
    if (action === "available") return pendingContinuationId === interactionId;
    if (pendingContinuationId !== interactionId) return false;
    pendingContinuationId = undefined;
    return true;
  }
}

function createInteraction(
  publisher: PresentationEventPublisher,
  continuation: (
    interactionId: string,
    action: "available" | "claim" | "open",
  ) => boolean,
  existingInteractionId?: string,
): PresentationInteraction {
  const interactionId =
    existingInteractionId ?? publisher.createInteractionId();
  if (!existingInteractionId) {
    publisher.publish({ interactionId, type: "wake_detected" });
  }

  const publish = (event: PendingInteractionEvent): void => {
    publisher.publish({ ...event, interactionId });
  };

  const interaction: PresentationInteraction = {
    claimContinuation: () => continuation(interactionId, "claim"),
    completed: () => publish({ type: "completed" }),
    confirmation: (prompt) => {
      continuation(interactionId, "open");
      publish({ prompt, type: "confirmation_required" });
    },
    continuationAvailable: () => continuation(interactionId, "available"),
    failed: (message) => publish({ message, type: "safe_failure" }),
    followUpListening: () => {
      if (!continuation(interactionId, "available")) return false;
      publish({ type: "follow_up_listening" });
      return true;
    },
    processing: () => publish({ type: "processing" }),
    response: (response) => {
      if (response.expectsFollowUp === true) {
        continuation(interactionId, "open");
      }
      publish({
        ...(response.citations ? { citations: response.citations } : {}),
        status: response.status,
        text: response.text,
        type: "response_ready",
      });
    },
    speakingFinished: () => publish({ type: "speaking_finished" }),
    speakingStarted: () => publish({ type: "speaking_started" }),
    transcriptDelta: (delta) => publish({ delta, type: "transcript_delta" }),
    transcriptFinal: (text) => publish({ text, type: "transcript_final" }),
  };
  return Object.freeze(interaction);
}
