import type {
  AssistantPresentationProjection,
  AssistantPresentationSnapshot,
} from "../../../../src/presentation-contract.js";

export type CommandCenterProjection = AssistantPresentationProjection;

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

export interface RuntimePresentationState {
  readonly connection: DesktopConnectionState;
  readonly projection?: CommandCenterProjection;
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
