import type { AssistantPresentationInteraction } from "../../../../src/presentation-contract.js";
import type { DesktopPresentationState } from "../model/desktop-state.js";
import {
  desktopSections,
  type DesktopMode,
  type DesktopSection,
} from "../model/navigation.js";
import {
  microphoneLabel,
  type CardViewState,
  type DesktopAppViewState,
  type ProfileFactViewState,
  type SourceViewState,
} from "./desktop-view-state.js";

export function projectDesktopView(options: {
  readonly autostartEnabled: boolean;
  readonly controlMessage?: string;
  readonly mode: DesktopMode;
  readonly presentation: DesktopPresentationState;
  readonly profileDrafts: ReadonlyMap<string, string>;
  readonly requestDraft: string;
  readonly section: DesktopSection;
  readonly shortcutDraft: string;
}): DesktopAppViewState {
  return Object.freeze({
    commandCenter: projectCommandCenter(options),
    mode: options.mode,
    overlay: projectOverlay(options.presentation, options.controlMessage),
  });
}

function projectCommandCenter(
  options: Parameters<typeof projectDesktopView>[0],
): DesktopAppViewState["commandCenter"] {
  const { presentation } = options;
  return Object.freeze({
    attention: Object.freeze(
      presentation.projection.attention.map((item) =>
        Object.freeze({ ...item }),
      ),
    ),
    autostartEnabled: options.autostartEnabled,
    cards: projectCards(options.section, presentation),
    connectionLabel: connectionLabel(presentation.connection),
    connectionState: presentation.connection,
    ...(options.controlMessage
      ? { controlMessage: options.controlMessage }
      : {}),
    microphoneLabel: microphoneLabel(presentation.snapshot?.microphone),
    profileFacts: projectProfileFacts(presentation, options.profileDrafts),
    requestDraft: options.requestDraft,
    section: options.section,
    sections: desktopSections,
    shortcutDraft: options.shortcutDraft,
    sources: projectSources(presentation),
  });
}

function projectOverlay(
  presentation: DesktopPresentationState,
  controlMessage: string | undefined,
): DesktopAppViewState["overlay"] {
  const interaction = presentation.snapshot?.interaction;
  const phase = interaction?.phase ?? "listening";
  return Object.freeze({
    connectionLabel: connectionLabel(presentation.connection),
    connectionState: presentation.connection,
    ...(controlMessage ? { controlMessage } : {}),
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
            sequence: interaction.confirmation.sequence,
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
  const projectors: Record<DesktopSection, () => readonly CardViewState[]> = {
    Today: () =>
      projection.today.map((detail, index) => ({
        detail,
        id: `today-${index}`,
        title: "Today",
      })),
    Tasks: () =>
      projection.tasks.map((item) => ({
        detail: item.status,
        id: item.id,
        title: item.label,
      })),
    Alarms: () =>
      projection.alarms.map((item) => ({
        detail: `${item.scheduledFor} · ${item.status}`,
        id: item.id,
        title: item.label,
      })),
    Interactions: () =>
      projection.interactions.map((item) => ({
        detail: item.response,
        id: item.id,
        title: item.request,
      })),
    Integrations: () =>
      projection.integrations.map((item) => ({
        detail: `${item.status} · ${item.lastCheck}`,
        id: item.label,
        title: item.label,
      })),
    Activity: () =>
      projection.activity.map((item, index) => ({
        detail: item.occurredAt,
        id: `activity-${index}`,
        title: item.summary,
      })),
    Inbox: () => [],
    Sources: () => [],
    Profile: () => [],
    Settings: () => [],
  };
  return projectors[section]();
}

function projectProfileFacts(
  state: DesktopPresentationState,
  drafts: ReadonlyMap<string, string>,
): readonly ProfileFactViewState[] {
  return state.projection.profile.map((item) => {
    const id = item.reference;
    return {
      draft: drafts.get(id) ?? item.value,
      field: item.field,
      id,
      label: readableField(item.field),
      provenance: item.provenance,
      value: item.value,
    };
  });
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

export function sourceById(state: DesktopPresentationState, sourceId: string) {
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
