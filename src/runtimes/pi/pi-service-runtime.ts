import {
  runConfiguredVoiceServiceRuntime,
  type ConfiguredVoiceServiceRuntimeOptions,
} from "../voice/configured-voice-service-runtime.js";

export function runPiServiceRuntime(
  options: ConfiguredVoiceServiceRuntimeOptions = {},
) {
  return runConfiguredVoiceServiceRuntime(options);
}
