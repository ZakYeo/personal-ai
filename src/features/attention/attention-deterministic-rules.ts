import type { DeterministicFeatureRule } from "../../ports/deterministic-feature-rules.js";

export const attentionDeterministicRules = [
  {
    capability: "attention.inbox.list",
    match: (text: string) =>
      /^(?:show|list|read) (?:my )?attention inbox$/u.test(text)
        ? {}
        : undefined,
  },
  {
    capability: "attention.rules.list",
    match: (text: string) =>
      /^(?:show|list) (?:my )?attention rules$/u.test(text) ? {} : undefined,
  },
  {
    capability: "attention.plan_day",
    match: (text: string) =>
      /^(?:help me )?plan (?:my |the )?day$/u.test(text) ? {} : undefined,
  },
  {
    capability: "attention.tasks.enable",
    match: (text: string) => {
      const match =
        /^enable task attention named (?<name>.+) within (?<days>\d+) days?$/u.exec(
          text,
        )?.groups;
      return match
        ? { name: match.name!, daysAhead: Number(match.days) }
        : undefined;
    },
  },
  {
    capability: "attention.calendar.enable",
    match: (text: string) => {
      const match =
        /^enable calendar attention named (?<name>.+) within (?<minutes>\d+) minutes?$/u.exec(
          text,
        )?.groups;
      return match
        ? { name: match.name!, leadMinutes: Number(match.minutes) }
        : undefined;
    },
  },
  {
    capability: "attention.conflicts.enable",
    match: (text: string) => {
      const match =
        /^enable conflict attention named (?<name>.+) within (?<hours>\d+) hours?$/u.exec(
          text,
        )?.groups;
      return match
        ? { name: match.name!, lookAheadHours: Number(match.hours) }
        : undefined;
    },
  },
  {
    capability: "attention.health.enable",
    match: (text: string) => {
      const match = /^enable health attention named (?<name>.+)$/u.exec(
        text,
      )?.groups;
      return match ? { name: match.name! } : undefined;
    },
  },
  {
    capability: "attention.morning.enable",
    match: (text: string) => {
      const match =
        /^enable morning routine named (?<name>.+) at (?<time>\d{2}:\d{2})$/u.exec(
          text,
        )?.groups;
      return match ? { name: match.name!, localTime: match.time! } : undefined;
    },
  },
  {
    capability: "attention.weather.enable",
    match: (text: string) => {
      const match =
        /^enable weather attention named (?<name>.+) for (?<metric>precipitation|temperature|wind speed) at (?<operator>least|most) (?<threshold>-?\d+(?:\.\d+)?) in (?<location>.+) within (?<hours>\d+) hours?$/u.exec(
          text,
        )?.groups;
      return match
        ? {
            name: match.name!,
            metric: match.metric === "wind speed" ? "windSpeed" : match.metric!,
            operator: match.operator === "least" ? "atLeast" : "atMost",
            threshold: Number(match.threshold),
            location: match.location!,
            periodHours: Number(match.hours),
          }
        : undefined;
    },
  },
] as const satisfies readonly DeterministicFeatureRule[];
