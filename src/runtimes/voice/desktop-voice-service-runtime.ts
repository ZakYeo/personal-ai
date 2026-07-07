import {
  runConfiguredVoiceServiceRuntime,
  type ConfiguredVoiceServiceRuntimeOptions,
} from "./configured-voice-service-runtime.js";

export function runDesktopVoiceServiceRuntime(
  options: ConfiguredVoiceServiceRuntimeOptions = {},
) {
  return runConfiguredVoiceServiceRuntime(options);
}
