import type { AssistantPresentationSnapshot } from "../../../../src/presentation-contract.js";

export interface CommandCenterProjection {
  readonly activity: readonly ActivityItem[];
  readonly alarms: readonly AlarmItem[];
  readonly integrations: readonly IntegrationItem[];
  readonly interactions: readonly InteractionItem[];
  readonly profile: readonly ProfileItem[];
  readonly sources: readonly SourceItem[];
  readonly tasks: readonly TaskItem[];
  readonly today: readonly string[];
}

interface ActivityItem {
  readonly occurredAt: string;
  readonly summary: string;
}

interface AlarmItem {
  readonly id: string;
  readonly label: string;
  readonly scheduledFor: string;
  readonly status: string;
}

interface IntegrationItem {
  readonly label: string;
  readonly status: "degraded" | "disabled" | "ready" | "unavailable";
}

interface InteractionItem {
  readonly id: string;
  readonly request: string;
  readonly response: string;
}

interface ProfileItem {
  readonly field: string;
  readonly provenance: "user-authored";
  readonly value: string;
}

interface SourceItem {
  readonly title: string;
  readonly url: string;
}

interface TaskItem {
  readonly id: string;
  readonly label: string;
  readonly status: string;
}

export type DesktopConnectionState =
  | "authentication_failed"
  | "connected"
  | "connecting"
  | "offline";

export interface DesktopPresentationState {
  readonly connection: DesktopConnectionState;
  readonly projection: CommandCenterProjection;
  readonly snapshot?: AssistantPresentationSnapshot;
}

export const emptyProjection: CommandCenterProjection = Object.freeze({
  activity: Object.freeze([]),
  alarms: Object.freeze([]),
  integrations: Object.freeze([]),
  interactions: Object.freeze([]),
  profile: Object.freeze([]),
  sources: Object.freeze([]),
  tasks: Object.freeze([]),
  today: Object.freeze([]),
});
