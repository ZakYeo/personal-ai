export function withRuntimeTestProviderConfig(config: unknown): unknown {
  if (!isRecord(config) || !isRecord(config.features)) return config;
  const calendar = config.features.calendar;
  if (!isRecord(calendar) || calendar.enabled !== true) return config;

  return {
    ...config,
    features: {
      ...config.features,
      calendar: {
        eventGrouping: { provider: "mock" },
        ...calendar,
      },
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
