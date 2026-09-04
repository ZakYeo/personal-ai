import type {
  AssistantCitation,
  AssistantResponseStatus,
} from "../../ports/assistant.js";
import { containsControlCharacters } from "../../application/text-safety.js";

const assistantPresentationLimits = Object.freeze({
  citationCount: 20,
  citationTitleCharacters: 300,
  citationUrlCharacters: 2_048,
  identifierCharacters: 128,
  promptCharacters: 1_000,
  responseCharacters: 4_000,
  transcriptCharacters: 2_000,
});

export type AssistantMicrophoneState =
  | "available"
  | "capturing"
  | "muted"
  | "unavailable";

export type AssistantPresentationPhase =
  | "listening"
  | "processing"
  | "confirmation"
  | "response"
  | "speaking"
  | "cancelling"
  | "completed"
  | "cancelled"
  | "failed";

interface RuntimeEventMetadata {
  readonly occurredAt: string;
  readonly sequence: number;
}

interface InteractionEventMetadata extends RuntimeEventMetadata {
  readonly interactionId: string;
}

export type AssistantRuntimeEvent =
  | (RuntimeEventMetadata & {
      readonly microphone: AssistantMicrophoneState;
      readonly type: "microphone_changed";
    })
  | (RuntimeEventMetadata & { readonly type: "wake_listening" })
  | (InteractionEventMetadata & { readonly type: "wake_detected" })
  | (InteractionEventMetadata & {
      readonly delta: string;
      readonly type: "transcript_delta";
    })
  | (InteractionEventMetadata & { readonly type: "follow_up_listening" })
  | (InteractionEventMetadata & {
      readonly text: string;
      readonly type: "transcript_final";
    })
  | (InteractionEventMetadata & { readonly type: "processing" })
  | (InteractionEventMetadata & {
      readonly prompt: string;
      readonly type: "confirmation_required";
    })
  | (InteractionEventMetadata & {
      readonly citations?: readonly AssistantCitation[];
      readonly status: AssistantResponseStatus;
      readonly text: string;
      readonly type: "response_ready";
    })
  | (InteractionEventMetadata & { readonly type: "speaking_started" })
  | (InteractionEventMetadata & { readonly type: "speaking_finished" })
  | (InteractionEventMetadata & {
      readonly type: "cancellation_requested";
    })
  | (InteractionEventMetadata & { readonly type: "completed" })
  | (InteractionEventMetadata & { readonly type: "cancelled" })
  | (InteractionEventMetadata & {
      readonly message: string;
      readonly type: "safe_failure";
    });

export interface AssistantPresentationResponse {
  readonly citations: readonly AssistantCitation[];
  readonly status: AssistantResponseStatus;
  readonly text: string;
}

export interface AssistantPresentationInteraction {
  readonly confirmation?: { readonly prompt: string };
  readonly failure?: { readonly message: string };
  readonly id: string;
  readonly phase: AssistantPresentationPhase;
  readonly response?: AssistantPresentationResponse;
  readonly transcript: string;
  readonly updatedAt: string;
}

export interface AssistantPresentationSnapshot {
  readonly instanceId: string;
  readonly interaction?: AssistantPresentationInteraction;
  readonly microphone: AssistantMicrophoneState;
  readonly sequence: number;
  readonly wakeListening: boolean;
}

export function createInitialAssistantPresentationSnapshot(input: {
  instanceId: string;
  microphone: AssistantMicrophoneState;
}): AssistantPresentationSnapshot {
  validateIdentifier(input.instanceId, "service instance ID");
  return freezeSnapshot({
    instanceId: input.instanceId,
    microphone: input.microphone,
    sequence: 0,
    wakeListening: false,
  });
}

export function reduceAssistantRuntimeEvent(
  snapshot: AssistantPresentationSnapshot,
  event: AssistantRuntimeEvent,
): AssistantPresentationSnapshot {
  validateEventMetadata(event, snapshot.sequence + 1);
  if ("interactionId" in event) {
    validateIdentifier(event.interactionId, "interaction ID");
    const active = snapshot.interaction;
    if (
      active &&
      !isTerminal(active.phase) &&
      active.id !== event.interactionId
    ) {
      throw new Error(
        `Presentation event targets ${event.interactionId} while active interaction ${active.id} is incomplete.`,
      );
    }
  }

  const base = { ...snapshot, sequence: event.sequence };
  switch (event.type) {
    case "microphone_changed":
      return freezeSnapshot({ ...base, microphone: event.microphone });
    case "wake_listening":
      return freezeSnapshot({ ...base, wakeListening: true });
    case "wake_detected":
      assertTransition(snapshot, event, [
        undefined,
        "completed",
        "cancelled",
        "failed",
      ]);
      return freezeSnapshot({
        ...base,
        interaction: createInteraction(event, "listening"),
        microphone: "capturing",
        wakeListening: false,
      });
    case "transcript_delta": {
      assertTransition(snapshot, event, ["listening"]);
      const interaction = requireInteraction(snapshot, event);
      const transcript = `${interaction.transcript}${event.delta}`;
      validateText(
        transcript,
        assistantPresentationLimits.transcriptCharacters,
        "transcript",
      );
      return freezeSnapshot({
        ...base,
        interaction: {
          ...interaction,
          transcript,
          updatedAt: event.occurredAt,
        },
      });
    }
    case "follow_up_listening":
      return transition(
        snapshot,
        base,
        event,
        ["confirmation", "response"],
        "listening",
      );
    case "transcript_final": {
      assertTransition(snapshot, event, ["listening"]);
      validateText(
        event.text,
        assistantPresentationLimits.transcriptCharacters,
        "transcript",
      );
      return freezeSnapshot({
        ...base,
        interaction: {
          ...requireInteraction(snapshot, event),
          transcript: event.text,
          updatedAt: event.occurredAt,
        },
      });
    }
    case "processing": {
      assertTransition(snapshot, event, [
        "listening",
        "confirmation",
        "response",
      ]);
      const current = snapshot.interaction;
      return freezeSnapshot({
        ...base,
        interaction: current
          ? {
              ...withoutConfirmation(current),
              phase: "processing",
              updatedAt: event.occurredAt,
            }
          : createInteraction(event, "processing"),
        microphone: "available",
      });
    }
    case "confirmation_required": {
      assertTransition(snapshot, event, ["processing"]);
      validateText(
        event.prompt,
        assistantPresentationLimits.promptCharacters,
        "confirmation prompt",
      );
      return freezeSnapshot({
        ...base,
        interaction: {
          ...requireInteraction(snapshot, event),
          confirmation: { prompt: event.prompt },
          phase: "confirmation",
          updatedAt: event.occurredAt,
        },
      });
    }
    case "response_ready": {
      assertTransition(snapshot, event, ["processing", "confirmation"]);
      validateText(
        event.text,
        assistantPresentationLimits.responseCharacters,
        "response text",
      );
      const citations = validateCitations(event.citations ?? []);
      return freezeSnapshot({
        ...base,
        interaction: {
          ...withoutConfirmation(requireInteraction(snapshot, event)),
          phase: "response",
          response: { citations, status: event.status, text: event.text },
          updatedAt: event.occurredAt,
        },
      });
    }
    case "speaking_started":
      return transition(snapshot, base, event, ["response"], "speaking");
    case "speaking_finished":
      return transition(snapshot, base, event, ["speaking"], "response");
    case "cancellation_requested":
      return transition(
        snapshot,
        base,
        event,
        ["listening", "processing", "confirmation"],
        "cancelling",
      );
    case "completed":
      return transition(snapshot, base, event, ["response"], "completed");
    case "cancelled":
      return transition(
        snapshot,
        base,
        event,
        ["listening", "processing", "confirmation", "cancelling"],
        "cancelled",
      );
    case "safe_failure": {
      assertTransition(snapshot, event, [
        "listening",
        "processing",
        "confirmation",
        "response",
        "speaking",
        "cancelling",
      ]);
      validateText(
        event.message,
        assistantPresentationLimits.responseCharacters,
        "failure message",
      );
      const interaction =
        snapshot.interaction ?? createInteraction(event, "failed");
      return freezeSnapshot({
        ...base,
        interaction: {
          ...withoutConfirmation(interaction),
          failure: { message: event.message },
          phase: "failed",
          updatedAt: event.occurredAt,
        },
        microphone: "available",
      });
    }
  }
}

function withoutConfirmation(
  interaction: AssistantPresentationInteraction,
): Omit<AssistantPresentationInteraction, "confirmation"> {
  return {
    id: interaction.id,
    phase: interaction.phase,
    transcript: interaction.transcript,
    updatedAt: interaction.updatedAt,
    ...(interaction.failure ? { failure: interaction.failure } : {}),
    ...(interaction.response ? { response: interaction.response } : {}),
  };
}

function transition(
  snapshot: AssistantPresentationSnapshot,
  base: AssistantPresentationSnapshot,
  event: Extract<AssistantRuntimeEvent, { interactionId: string }>,
  allowed: Array<AssistantPresentationPhase | undefined>,
  phase: AssistantPresentationPhase,
): AssistantPresentationSnapshot {
  assertTransition(snapshot, event, allowed);
  return freezeSnapshot({
    ...base,
    interaction: {
      ...requireInteraction(snapshot, event),
      phase,
      updatedAt: event.occurredAt,
    },
    ...(isTerminal(phase) ? { microphone: "available" as const } : {}),
  });
}

function createInteraction(
  event: Extract<AssistantRuntimeEvent, { interactionId: string }>,
  phase: AssistantPresentationPhase,
): AssistantPresentationInteraction {
  return {
    id: event.interactionId,
    phase,
    transcript: "",
    updatedAt: event.occurredAt,
  };
}

function assertTransition(
  snapshot: AssistantPresentationSnapshot,
  event: Extract<AssistantRuntimeEvent, { interactionId: string }>,
  allowed: Array<AssistantPresentationPhase | undefined>,
): void {
  const current = snapshot.interaction;
  const phase = current?.phase;
  if (!allowed.includes(phase)) {
    throw new Error(
      `Presentation event ${event.type} cannot transition from ${phase ?? "idle"} to ${phaseForEvent(event)}.`,
    );
  }
  if (
    current &&
    !isTerminal(current.phase) &&
    current.id !== event.interactionId
  ) {
    throw new Error(
      `Presentation event does not target active interaction ${current.id}.`,
    );
  }
}

function requireInteraction(
  snapshot: AssistantPresentationSnapshot,
  event: Extract<AssistantRuntimeEvent, { interactionId: string }>,
): AssistantPresentationInteraction {
  const interaction = snapshot.interaction;
  if (!interaction || interaction.id !== event.interactionId) {
    throw new Error("Presentation event has no matching active interaction.");
  }
  return interaction;
}

function phaseForEvent(
  event: Extract<AssistantRuntimeEvent, { interactionId: string }>,
): string {
  const phases: Partial<Record<AssistantRuntimeEvent["type"], string>> = {
    cancelled: "cancelled",
    cancellation_requested: "cancelling",
    completed: "completed",
    confirmation_required: "confirmation",
    follow_up_listening: "listening",
    processing: "processing",
    response_ready: "response",
    safe_failure: "failed",
    speaking_finished: "response",
    speaking_started: "speaking",
    transcript_delta: "listening",
    transcript_final: "listening",
    wake_detected: "listening",
  };
  return phases[event.type] ?? event.type;
}

function validateEventMetadata(
  event: AssistantRuntimeEvent,
  expectedSequence: number,
): void {
  if (event.sequence !== expectedSequence) {
    throw new Error(
      `Presentation event expected sequence ${expectedSequence} but received ${event.sequence}.`,
    );
  }
  if (!Number.isInteger(event.sequence) || event.sequence < 1) {
    throw new Error("Presentation event sequence must be a positive integer.");
  }
  if (
    typeof event.occurredAt !== "string" ||
    Number.isNaN(Date.parse(event.occurredAt))
  ) {
    throw new Error("Presentation event timestamp must be valid.");
  }
}

function validateIdentifier(value: string, label: string): void {
  if (
    value.length === 0 ||
    value.length > assistantPresentationLimits.identifierCharacters ||
    containsControlCharacters(value)
  ) {
    throw new Error(`Presentation ${label} is outside safe bounds.`);
  }
}

function validateText(value: string, maximum: number, label: string): void {
  if (value.length > maximum) {
    throw new Error(`Presentation ${label} exceeded ${maximum} characters.`);
  }
  if (containsControlCharacters(value)) {
    throw new Error(
      `Presentation ${label} contains unsafe control characters.`,
    );
  }
}

function validateCitations(
  citations: readonly AssistantCitation[],
): readonly AssistantCitation[] {
  if (citations.length > assistantPresentationLimits.citationCount) {
    throw new Error("Presentation citations exceeded the item limit.");
  }
  return citations.map((citation) => {
    validateText(
      citation.title,
      assistantPresentationLimits.citationTitleCharacters,
      "citation title",
    );
    if (
      citation.title.length === 0 ||
      citation.url.length > assistantPresentationLimits.citationUrlCharacters ||
      containsControlCharacters(citation.url) ||
      !isHttpsUrl(citation.url)
    ) {
      throw new Error("Presentation citation URL must be a bounded HTTPS URL.");
    }
    return Object.freeze({ title: citation.title, url: citation.url });
  });
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isTerminal(phase: AssistantPresentationPhase): boolean {
  return ["completed", "cancelled", "failed"].includes(phase);
}

function freezeSnapshot(
  snapshot: AssistantPresentationSnapshot,
): AssistantPresentationSnapshot {
  const interaction = snapshot.interaction
    ? Object.freeze({
        ...snapshot.interaction,
        ...(snapshot.interaction.confirmation
          ? {
              confirmation: Object.freeze({
                ...snapshot.interaction.confirmation,
              }),
            }
          : {}),
        ...(snapshot.interaction.failure
          ? { failure: Object.freeze({ ...snapshot.interaction.failure }) }
          : {}),
        ...(snapshot.interaction.response
          ? {
              response: Object.freeze({
                ...snapshot.interaction.response,
                citations: Object.freeze([
                  ...snapshot.interaction.response.citations,
                ]),
              }),
            }
          : {}),
      })
    : undefined;
  return Object.freeze({
    ...snapshot,
    ...(interaction ? { interaction } : {}),
  });
}
