import type {
  AssistantCitation,
  AssistantResponseStatus,
} from "./assistant.js";

export const presentationProtocolVersion = 1;

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

export interface AssistantPresentationProjection {
  readonly activity: readonly PresentationActivityItem[];
  readonly alarms: readonly PresentationAlarmItem[];
  readonly integrations: readonly PresentationIntegrationItem[];
  readonly interactions: readonly PresentationInteractionItem[];
  readonly profile: readonly PresentationProfileItem[];
  readonly sources: readonly AssistantCitation[];
  readonly tasks: readonly PresentationTaskItem[];
  readonly today: readonly string[];
}

export interface PresentationActivityItem {
  readonly occurredAt: string;
  readonly summary: string;
}

export interface PresentationAlarmItem {
  readonly id: string;
  readonly label: string;
  readonly scheduledFor: string;
  readonly status: string;
}

export interface PresentationIntegrationItem {
  readonly label: string;
  readonly status: "degraded" | "disabled" | "ready" | "unavailable";
}

export interface PresentationInteractionItem {
  readonly id: string;
  readonly request: string;
  readonly response: string;
}

export interface PresentationProfileItem {
  readonly field: string;
  readonly provenance: "user-authored";
  readonly value: string;
}

export interface PresentationTaskItem {
  readonly id: string;
  readonly label: string;
  readonly status: string;
}

export type PresentationControl =
  | {
      readonly requestId: string;
      readonly text: string;
      readonly type: "submit_text";
    }
  | {
      readonly interactionId: string;
      readonly requestId: string;
      readonly type: "confirm" | "decline";
    }
  | {
      readonly requestId: string;
      readonly type: "dismiss_overlay" | "stop_listening";
    };

export interface PresentationControlResult {
  readonly message?: string;
  readonly status: "accepted" | "busy" | "rejected";
}

export type PresentationServerMessage =
  | {
      readonly projection: AssistantPresentationProjection;
      readonly protocolVersion: typeof presentationProtocolVersion;
      readonly type: "projection";
    }
  | {
      readonly event: AssistantRuntimeEvent;
      readonly protocolVersion: typeof presentationProtocolVersion;
      readonly type: "event";
    }
  | {
      readonly protocolVersion: typeof presentationProtocolVersion;
      readonly snapshot: AssistantPresentationSnapshot;
      readonly type: "snapshot";
    }
  | ({
      readonly protocolVersion: typeof presentationProtocolVersion;
      readonly requestId: string;
      readonly type: "control_result";
    } & PresentationControlResult)
  | {
      readonly code: string;
      readonly message: string;
      readonly protocolVersion: typeof presentationProtocolVersion;
      readonly type: "error";
    };
