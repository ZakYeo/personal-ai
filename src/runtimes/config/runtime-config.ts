import type { AssistantPolicyConfig } from "../../ports/assistant.js";
import type {
  ParsedDesktopVoiceConfig,
  RawDesktopVoiceConfig,
} from "./desktop-voice-config.js";
import type {
  ParsedFeaturesConfig,
  RawFeaturesConfig,
} from "./feature-config.js";
import type { ParsedIntentConfig } from "./intent-config.js";
import type { ParsedVoiceConfig } from "./voice-config.js";

export interface LoadedRuntimeConfig extends AssistantPolicyConfig {
  desktopVoice?: ParsedDesktopVoiceConfig;
  rawDesktopVoice?: RawDesktopVoiceConfig;
  voice?: ParsedVoiceConfig;
  intent: ParsedIntentConfig;
  features: ParsedFeaturesConfig;
  rawFeatures?: RawFeaturesConfig;
}
