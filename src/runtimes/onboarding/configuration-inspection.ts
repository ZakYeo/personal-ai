import type { ProcessingLocation } from "../processing-inspection.js";
import type { RuntimeConfigSource } from "../config/runtime-config-source.js";
import { resolveLocalStatePath } from "../local-state-path.js";

export function inspectRuntimeConfiguration(
  source: RuntimeConfigSource,
): readonly string[] {
  const { config } = source;
  const lines = [
    `Config directory: ${JSON.stringify(source.configDirectory ?? "not supplied")}`,
    `Intent: ${providerDescription(config.intent.provider, config.intent.resolvedProvider.processing)}`,
    `Conversation: ${providerDescription(config.conversation.provider, config.conversation.resolvedProvider.processing)}`,
    `Response rewriting: ${providerDescription(config.responseRewriter.provider, config.responseRewriter.resolvedProvider.processing)}`,
    "No integration checks have run.",
  ];
  const voiceProcessing: Readonly<
    Record<string, ProcessingLocation | undefined>
  > = {
    streamingSpeechToText:
      config.desktopVoice?.streamingSpeechToTextProvider?.processing,
    streamingTextToSpeech:
      config.desktopVoice?.streamingTextToSpeechProvider?.processing,
  };
  for (const [slot, provider] of Object.entries(config.voice ?? {})) {
    if (typeof provider === "string")
      lines.push(
        `Voice ${slot}: ${providerDescription(provider, voiceProcessing[slot])}`,
      );
  }
  for (const [name, feature] of Object.entries(config.features)) {
    lines.push(
      `${name}: ${feature.enabled ? `configured (${feature.adapter})` : "disabled"}`,
    );
    if (!feature.enabled) continue;
    const inspection = feature.resolvedAdapter.inspect?.();
    for (const surface of inspection?.processing ?? [])
      lines.push(`  ${surface.name}: ${surface.location}`);
    if (!inspection) lines.push("  Processing: unchecked");
    for (const path of inspection?.statePaths ?? [])
      lines.push(
        `  Durable state: ${JSON.stringify(resolveLocalStatePath(path, source.configDirectory))}`,
      );
  }
  lines.push(
    "Command providers run operator-configured programs; review those programs for remote processing.",
  );
  lines.push(
    "File state has one process owner. Stop the voice service before standalone setup checks.",
  );
  return lines;
}

function providerDescription(
  provider: string,
  processing?: ProcessingLocation,
): string {
  return `${provider} (${processing ?? "operator configured; unchecked"})`;
}
