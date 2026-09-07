import type { AssistantResponse } from "../../ports/assistant.js";
import type { AssistantMicrophoneState } from "../../ports/presentation.js";
import type {
  AssistantRuntimeEvent,
  PendingAssistantRuntimeEvent,
} from "./assistant-runtime-event-stream.js";

interface PresentationEventPublisher {
  createInteractionId(): string;
  publish(event: PendingAssistantRuntimeEvent): AssistantRuntimeEvent;
}

export interface PresentationInteraction {
  interrupted(): void;
  cancelled(): void;
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
  microphoneChanged(microphone: AssistantMicrophoneState): void;
  beginInteraction(): PresentationInteraction;
  beginVoiceInteraction(): PresentationInteraction;
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
  interrupted: noOperation,
  cancelled: noOperation,
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
      microphoneChanged: noOperation,
      beginInteraction: () => noOpInteraction,
      beginVoiceInteraction: () => noOpInteraction,
      continueInteraction: () => noOpInteraction,
      wakeListening: noOperation,
    });
  }

  let pending: { id: string; token: symbol } | undefined;
  const continuationOwner: ContinuationOwner = {
    current: (id) => (pending?.id === id ? pending.token : undefined),
    open: (id) => {
      pending = { id, token: Symbol() };
      return pending.token;
    },
    claim: (id, token) => {
      if (!pending || pending.id !== id || pending.token !== token)
        return false;
      pending = undefined;
      return true;
    },
  };

  return Object.freeze({
    microphoneChanged: (microphone: AssistantMicrophoneState) =>
      publisher.publish({ type: "microphone_changed", microphone }),
    beginInteraction: () =>
      createInteraction(publisher, continuationOwner, undefined),
    beginVoiceInteraction: () => {
      const interaction = createInteraction(
        publisher,
        continuationOwner,
        pending?.id,
      );
      if (pending) {
        interaction.interrupted();
        interaction.followUpListening();
      }
      return interaction;
    },
    continueInteraction: (interactionId: string) =>
      createInteraction(publisher, continuationOwner, interactionId),
    wakeListening: () => publisher.publish({ type: "wake_listening" }),
  });
}

interface ContinuationOwner {
  current(id: string): symbol | undefined;
  open(id: string): symbol;
  claim(id: string, token: symbol | undefined): boolean;
}

function createInteraction(
  publisher: PresentationEventPublisher,
  continuation: ContinuationOwner,
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

  let token = continuation.current(interactionId);
  const available = () =>
    token !== undefined && continuation.current(interactionId) === token;
  const interaction: PresentationInteraction = {
    interrupted: () => {
      if (token !== undefined) {
        if (available()) publish({ type: "follow_up_paused" });
        return;
      }
      publish({ type: "cancelled" });
    },
    cancelled: () => publish({ type: "cancelled" }),
    claimContinuation: () => {
      const claimed = continuation.claim(interactionId, token);
      if (claimed) token = undefined;
      return claimed;
    },
    completed: () => publish({ type: "completed" }),
    confirmation: (prompt) => {
      token = continuation.open(interactionId);
      publish({ prompt, type: "confirmation_required" });
    },
    continuationAvailable: available,
    failed: (message) => publish({ message, type: "safe_failure" }),
    followUpListening: () => {
      if (!available()) return false;
      publish({ type: "follow_up_listening" });
      return true;
    },
    processing: () => publish({ type: "processing" }),
    response: (response) => {
      if (response.expectsFollowUp === true) {
        token = continuation.open(interactionId);
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
