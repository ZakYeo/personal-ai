export type {
  AssistantMicrophoneState,
  AssistantPresentationInteraction,
  AssistantPresentationPhase,
  AssistantPresentationProjection,
  AssistantPresentationSnapshot,
  PresentationControl,
  PresentationControlResult,
} from "./ports/presentation.js";

export { presentationProtocolVersion } from "./ports/presentation.js";
export {
  parsePresentationControl,
  parsePresentationServerMessage,
} from "./application/presentation-protocol.js";
export { emptyAssistantPresentationProjection } from "./application/presentation-projection.js";
export { reduceAssistantRuntimeEvent } from "./runtimes/presentation/assistant-runtime-event.js";
