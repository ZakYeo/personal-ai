import type { ResolvedVoiceConfig } from "../config/config.js";

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

  const createAdapter = registry[adapterId];

  if (!createAdapter) {
    throw new Error(`Config voice.${key} "${adapterId}" is not registered.`);
  }

  return createAdapter;
}
