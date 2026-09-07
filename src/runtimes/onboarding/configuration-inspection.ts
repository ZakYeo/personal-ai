import type { RuntimeConfigSource } from "../config/runtime-config-source.js";
import { resolveLocalStatePath } from "../local-state-path.js";

export function inspectRuntimeConfiguration(
  source: RuntimeConfigSource,
): readonly string[] {
  const { config } = source;
  const lines = [
    `Config directory: ${JSON.stringify(source.configDirectory ?? "not supplied")}`,
    `Intent: ${providerDescription(config.intent.provider)}`,
    `Conversation: ${providerDescription(config.conversation.provider)}`,
    `Response rewriting: ${providerDescription(config.responseRewriter.provider)}`,
    "No integration checks have run.",
  ];
  for (const [slot, provider] of Object.entries(config.voice ?? {})) {
    if (typeof provider === "string")
      lines.push(`Voice ${slot}: ${providerDescription(provider)}`);
  }
  for (const [name, feature] of Object.entries(config.features)) {
    lines.push(
      `${name}: ${feature.enabled ? `configured (${feature.adapter})` : "disabled"}`,
    );
    if (!feature.enabled) continue;
    for (const path of feature.resolvedAdapter.statePaths?.() ?? [])
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

function providerDescription(provider: string): string {
  const processing = ["openai", "openai-realtime", "openai-streaming"].includes(
    provider,
  )
    ? "remote"
    : [
          "mock",
          "deterministic",
          "disabled",
          "text-prefix",
          "sox-rec",
          "sox-play",
          "sox-rec-stream",
          "sox-play-stream",
        ].includes(provider)
      ? "local"
      : "operator configured; unchecked";
  return `${provider} (${processing})`;
}
