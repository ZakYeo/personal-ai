import type { AssistantPolicyConfig } from "../../ports/assistant.js";
import type { ParsedConversationConfig } from "./conversation-config.js";
import type { ParsedDesktopVoiceConfig } from "./desktop-voice-config.js";
import type { ParsedFeaturesConfig } from "./feature-config.js";
import type { ParsedIntentConfig } from "./intent-config.js";
import type { ParsedVoiceConfig } from "./voice-config.js";

export interface LoadedRuntimeConfig extends AssistantPolicyConfig {
  desktopVoice?: ParsedDesktopVoiceConfig;
  conversation: ParsedConversationConfig;
  voice?: ParsedVoiceConfig;
  intent: ParsedIntentConfig;
  features: ParsedFeaturesConfig;
}
