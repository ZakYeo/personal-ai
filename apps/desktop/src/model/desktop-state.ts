import {
  emptyAssistantPresentationProjection,
  type AssistantPresentationProjection,
  type AssistantPresentationSnapshot,
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

export const emptyProjection = emptyAssistantPresentationProjection;
