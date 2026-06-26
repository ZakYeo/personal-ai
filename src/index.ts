export { createAssistant } from "./core/assistant/index.js";
export type {
  Assistant,
  AssistantDependencies,
  AssistantOutcome,
} from "./core/assistant/index.js";
export type {
  AssistantCommand,
  AssistantCommandParameters,
  AssistantConfig,
  AssistantContext,
  AssistantResponse,
  AssistantResponseStatus,
  ClockPort,
} from "./ports/assistant.js";
export type {
  FeatureCapability,
  FeaturePlugin,
  FeatureResult,
} from "./ports/feature.js";
export type {
  IntentInterpretation,
  IntentInterpreterPort,
} from "./ports/intent.js";
