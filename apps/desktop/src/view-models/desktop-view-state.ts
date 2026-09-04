import type {
  AssistantMicrophoneState,
  AssistantPresentationPhase,
} from "../../../../src/presentation-contract.js";
import type { DesktopConnectionState } from "../model/desktop-state.js";
import type { DesktopMode, DesktopSection } from "../model/navigation.js";

export interface CardViewState {
  readonly detail: string;
  readonly id: string;
  readonly title: string;
}

export interface SourceViewState {
  readonly id: string;
  readonly title: string;
}

export interface ProfileFactViewState {
  readonly draft: string;
  readonly field: string;
  readonly id: string;
  readonly label: string;
  readonly provenance: "user-authored";
  readonly value: string;
}

export interface OverlayViewState {
  readonly connectionLabel: string;
  readonly connectionState: DesktopConnectionState;
  readonly confirmation?: {
    readonly interactionId: string;
    readonly prompt: string;
  };
  readonly controlMessage?: string;
  readonly failure?: string;
  readonly microphoneLabel: string;
  readonly phase: AssistantPresentationPhase;
  readonly response?: string;
  readonly sources: readonly SourceViewState[];
  readonly title: string;
  readonly transcript?: string;
}

export interface CommandCenterViewState {
  readonly autostartEnabled: boolean;
  readonly cards: readonly CardViewState[];
  readonly connectionLabel: string;
  readonly connectionState: DesktopConnectionState;
  readonly controlMessage?: string;
  readonly microphoneLabel: string;
  readonly profileFacts: readonly ProfileFactViewState[];
  readonly requestDraft: string;
  readonly section: DesktopSection;
  readonly sections: readonly DesktopSection[];
  readonly sources: readonly SourceViewState[];
  readonly shortcutDraft: string;
}

export interface DesktopAppViewState {
  readonly commandCenter: CommandCenterViewState;
  readonly mode: DesktopMode;
  readonly overlay: OverlayViewState;
}

export function microphoneLabel(
  state: AssistantMicrophoneState | undefined,
): string {
  const labels: Record<AssistantMicrophoneState, string> = {
    available: "Mic ready",
    capturing: "Mic active",
    muted: "Mic muted",
    unavailable: "Mic unavailable",
  };
  return state ? labels[state] : "Mic unknown";
}
