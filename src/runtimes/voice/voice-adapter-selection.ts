import type { ResolvedVoiceConfig } from "../config/config.js";
import { selectConfiguredRuntimeEntry } from "../runtime-selector.js";

type VoiceAdapterKey = keyof ResolvedVoiceConfig;

export function selectConfiguredVoiceAdapter<
  TAdapter,
  TOptions extends unknown[],
>(
  config: ResolvedVoiceConfig,
  key: VoiceAdapterKey,
  registry: Record<string, (...options: TOptions) => TAdapter>,
): (...options: TOptions) => TAdapter {
  const adapterId = config[key];

  return selectConfiguredRuntimeEntry({
    configuredId: adapterId,
    missingMessage: `Config voice.${key} must be configured.`,
    registry,
    unknownMessage: (configuredId) =>
      `Config voice.${key} "${configuredId}" is not registered.`,
  });
}
