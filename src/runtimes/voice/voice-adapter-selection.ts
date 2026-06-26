import type { AssistantConfig } from "../../ports/assistant.js";

type VoiceConfig = NonNullable<AssistantConfig["voice"]>;
type VoiceAdapterKey = keyof VoiceConfig;

export function selectConfiguredVoiceAdapter<
  TAdapter,
  TOptions extends unknown[],
>(
  config: AssistantConfig,
  key: VoiceAdapterKey,
  registry: Record<string, (...options: TOptions) => TAdapter>,
): (...options: TOptions) => TAdapter {
  const adapterId = config.voice?.[key];

  if (adapterId === undefined) {
    throw new Error(`Config voice.${key} must be configured.`);
  }

  const createAdapter = registry[adapterId];

  if (!createAdapter) {
    throw new Error(`Config voice.${key} "${adapterId}" is not registered.`);
  }

  return createAdapter;
}
