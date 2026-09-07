import type { AttentionRuleDefinition } from "../ports/attention.js";
import type { AssistantCommandParameters } from "../ports/assistant.js";

export function describeAttentionRule(definition: AttentionRuleDefinition): {
  text: string;
  facts: AssistantCommandParameters;
} {
  switch (definition.kind) {
    case "upcoming_calendar":
      return {
        text: `events starting within ${definition.leadMinutes} minutes`,
        facts: { leadMinutes: definition.leadMinutes },
      };
    case "due_tasks":
      return {
        text: `open tasks due within ${definition.daysAhead} days`,
        facts: { daysAhead: definition.daysAhead },
      };
    case "conflicting_commitments":
      return {
        text: `overlapping calendar commitments within ${definition.lookAheadHours} hours`,
        facts: { lookAheadHours: definition.lookAheadHours },
      };
    case "runtime_health":
      return {
        text: "unavailable attention sources, missed alarms and uncertain reminder deliveries",
        facts: {},
      };
    case "morning_routine":
      return {
        text: `a morning briefing at ${definition.localTime} from profile, calendar, tasks and weather, with read-only planning help`,
        facts: { localTime: definition.localTime },
      };
    case "material_weather":
      return {
        text: `${definition.condition.metric} ${definition.condition.operator === "atLeast" ? "at least" : "at most"} ${definition.condition.threshold} ${definition.condition.unit} in ${definition.location.name} during the next ${definition.periodHours} hours`,
        facts: {
          location: definition.location.name,
          latitude: definition.location.latitude,
          longitude: definition.location.longitude,
          locationTimeZone: definition.location.timezone,
          ...definition.condition,
          periodHours: definition.periodHours,
        },
      };
  }
}
