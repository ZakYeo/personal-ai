interface RuntimeSelectionOptions<TEntry> {
  configuredId: string | undefined;
  missingMessage: string;
  registry: Record<string, TEntry>;
  unknownMessage: (configuredId: string) => string;
}

export function selectConfiguredRuntimeEntry<TEntry>({
  configuredId,
  missingMessage,
  registry,
  unknownMessage,
}: RuntimeSelectionOptions<TEntry>): TEntry {
  if (!configuredId) {
    throw new Error(missingMessage);
  }

  const entry = registry[configuredId];

  if (!entry) {
    throw new Error(unknownMessage(configuredId));
  }

  return entry;
}
