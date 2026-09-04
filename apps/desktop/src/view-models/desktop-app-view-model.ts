import type {
  AssistantPresentationInteraction,
  PresentationControl,
} from "../../../../src/presentation-contract.js";
import type { DesktopPresentationState } from "../model/desktop-state.js";
import {
  desktopSections,
  type DesktopMode,
  type DesktopSection,
} from "../model/navigation.js";
import type { DesktopHost } from "../ports/desktop-host.js";
import {
  microphoneLabel,
  type CardViewState,
  type DesktopAppViewState,
  type SourceViewState,
} from "./desktop-view-state.js";

export interface DesktopAppViewModel {
  readonly confirm: (interactionId: string) => void;
  readonly decline: (interactionId: string) => void;
  readonly dismissOverlay: () => void;
  readonly getSnapshot: () => DesktopAppViewState;
  readonly openSource: (sourceId: string) => void;
  readonly selectSection: (section: DesktopSection) => void;
  readonly stopListening: () => void;
  readonly submitRequest: () => void;
  readonly subscribe: (listener: () => void) => () => void;
  readonly updateRequestDraft: (value: string) => void;
}

export function createDesktopAppViewModel(options: {
  readonly host: DesktopHost;
  readonly initialState: DesktopPresentationState;
  readonly mode: DesktopMode;
}): DesktopAppViewModel {
  const presentation = options.initialState;
  let requestDraft = "";
  let section: DesktopSection = "Today";
  let snapshot = project();
  const listeners = new Set<() => void>();

  function project(): DesktopAppViewState {
    return Object.freeze({
      commandCenter: projectCommandCenter(presentation, section, requestDraft),
      mode: options.mode,
      overlay: projectOverlay(presentation),
    });
  }

  function update(mutator: () => void): void {
    mutator();
    snapshot = project();
    for (const listener of listeners) listener();
  }

  function dispatch(control: PresentationControl): void {
    void options.host.sendControl(control);
  }

  const viewModel: DesktopAppViewModel = {
    confirm: (interactionId) =>
      dispatch({ interactionId, requestId: requestId(), type: "confirm" }),
    decline: (interactionId) =>
      dispatch({ interactionId, requestId: requestId(), type: "decline" }),
    dismissOverlay: () =>
      dispatch({ requestId: requestId(), type: "dismiss_overlay" }),
    getSnapshot: () => snapshot,
    openSource: (sourceId) => {
      const source = sourceById(presentation, sourceId);
      if (source) void options.host.openSource(source.url);
    },
    selectSection: (nextSection) => update(() => (section = nextSection)),
    stopListening: () =>
      dispatch({ requestId: requestId(), type: "stop_listening" }),
    submitRequest: () => {
      const text = requestDraft.trim();
      if (!text) return;
      dispatch({ requestId: requestId(), text, type: "submit_text" });
      update(() => (requestDraft = ""));
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    updateRequestDraft: (value) => update(() => (requestDraft = value)),
  };
  return Object.freeze(viewModel);
}

function projectCommandCenter(
  presentation: DesktopPresentationState,
  section: DesktopSection,
  requestDraft: string,
): DesktopAppViewState["commandCenter"] {
  return Object.freeze({
    cards: projectCards(section, presentation),
    connectionLabel: connectionLabel(presentation.connection),
    connectionState: presentation.connection,
    microphoneLabel: microphoneLabel(presentation.snapshot?.microphone),
    requestDraft,
    section,
    sections: desktopSections,
    sources: projectSources(presentation),
  });
}

function projectOverlay(
  presentation: DesktopPresentationState,
): DesktopAppViewState["overlay"] {
  const interaction = presentation.snapshot?.interaction;
  const phase = interaction?.phase ?? "listening";
  return Object.freeze({
    connectionLabel: connectionLabel(presentation.connection),
    connectionState: presentation.connection,
    ...projectInteractionFields(interaction),
    microphoneLabel: microphoneLabel(presentation.snapshot?.microphone),
    phase,
    sources: projectResponseSources(presentation),
    title: overlayTitle(phase),
  });
}

function projectInteractionFields(
  interaction: AssistantPresentationInteraction | undefined,
): Pick<
  DesktopAppViewState["overlay"],
  "confirmation" | "failure" | "response" | "transcript"
> {
  if (!interaction) return {};
  return {
    ...(interaction.confirmation
      ? {
          confirmation: {
            interactionId: interaction.id,
            prompt: interaction.confirmation.prompt,
          },
        }
      : {}),
    ...(interaction.failure ? { failure: interaction.failure.message } : {}),
    ...(interaction.response ? { response: interaction.response.text } : {}),
    ...(interaction.transcript ? { transcript: interaction.transcript } : {}),
  };
}

function projectCards(
  section: DesktopSection,
  state: DesktopPresentationState,
): readonly CardViewState[] {
  const projection = state.projection;
  switch (section) {
    case "Today":
      return projection.today.map((detail, index) => ({
        detail,
        id: `today-${index}`,
        title: "Today",
      }));
    case "Tasks":
      return projection.tasks.map((item) => ({
        detail: item.status,
        id: item.id,
        title: item.label,
      }));
    case "Alarms":
      return projection.alarms.map((item) => ({
        detail: `${item.scheduledFor} · ${item.status}`,
        id: item.id,
        title: item.label,
      }));
    case "Interactions":
      return projection.interactions.map((item) => ({
        detail: item.response,
        id: item.id,
        title: item.request,
      }));
    case "Profile":
      return projection.profile.map((item) => ({
        detail: `${item.value} · ${item.provenance}`,
        id: item.field,
        title: readableField(item.field),
      }));
    case "Integrations":
      return projection.integrations.map((item) => ({
        detail: item.status,
        id: item.label,
        title: item.label,
      }));
    case "Activity":
      return projection.activity.map((item, index) => ({
        detail: item.occurredAt,
        id: `activity-${index}`,
        title: item.summary,
      }));
    case "Settings":
      return [
        {
          detail: "Autostart and wake listening require explicit consent.",
          id: "privacy",
          title: "Privacy first",
        },
      ];
    case "Sources":
      return [];
  }
}

function projectSources(
  state: DesktopPresentationState,
): readonly SourceViewState[] {
  return state.projection.sources.map((source, index) => ({
    id: `projection-${index}`,
    title: source.title,
  }));
}

function projectResponseSources(
  state: DesktopPresentationState,
): readonly SourceViewState[] {
  return (state.snapshot?.interaction?.response?.citations ?? []).map(
    (source, index) => ({ id: `response-${index}`, title: source.title }),
  );
}

function sourceById(state: DesktopPresentationState, sourceId: string) {
  const [kind, rawIndex] = sourceId.split("-");
  const index = Number(rawIndex);
  if (!Number.isSafeInteger(index) || index < 0) return;
  return kind === "response"
    ? state.snapshot?.interaction?.response?.citations[index]
    : kind === "projection"
      ? state.projection.sources[index]
      : undefined;
}

function overlayTitle(phase: DesktopAppViewState["overlay"]["phase"]): string {
  const titles: Record<typeof phase, string> = {
    cancelled: "Cancelled",
    cancelling: "Stopping…",
    completed: "Done",
    confirmation: "Needs your approval",
    failed: "Something went wrong",
    listening: "Listening…",
    processing: "Thinking…",
    response: "Ready",
    speaking: "Speaking…",
  };
  return titles[phase];
}

function connectionLabel(
  state: DesktopPresentationState["connection"],
): string {
  return {
    authentication_failed: "Authentication needed",
    connected: "Service connected",
    connecting: "Connecting…",
    offline: "Service offline",
  }[state];
}

function readableField(field: string): string {
  return field
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (character) => character.toUpperCase());
}

let requestSequence = 0;
function requestId(): string {
  requestSequence += 1;
  return `desktop-${requestSequence}`;
}
