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
  return selectConfiguredRuntimeEntryWithId({
    configuredId,
    missingMessage,
    registry,
    unknownMessage,
  }).entry;
}

export function selectConfiguredRuntimeEntryWithId<TEntry>({
  configuredId,
  missingMessage,
  registry,
  unknownMessage,
}: RuntimeSelectionOptions<TEntry>): { configuredId: string; entry: TEntry } {
  if (!configuredId) {
    throw new Error(missingMessage);
  }

  const entry = registry[configuredId];

  if (!entry) {
    throw new Error(unknownMessage(configuredId));
  }

  return { configuredId, entry };
}
