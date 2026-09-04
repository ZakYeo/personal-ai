import type {
  AssistantPresentationProjection,
  PresentationActivityItem,
  PresentationAlarmItem,
  PresentationIntegrationItem,
  PresentationInteractionItem,
  PresentationProfileItem,
  PresentationTaskItem,
} from "../ports/presentation.js";
import { containsControlCharacters } from "./text-safety.js";
import { isSpokenTextSafe } from "./human-text.js";

const projectionLimits = Object.freeze({
  activities: 100,
  alarms: 100,
  integrations: 50,
  interactions: 50,
  profiles: 50,
  sources: 20,
  tasks: 100,
  textCharacters: 1_000,
  today: 50,
  urlCharacters: 2_048,
});

export function parseAssistantPresentationProjection(
  value: unknown,
): AssistantPresentationProjection | undefined {
  if (!isRecord(value) || !hasExactProjectionKeys(value)) return;
  const activity = parseArray(
    value.activity,
    projectionLimits.activities,
    parseActivity,
  );
  const alarms = parseArray(value.alarms, projectionLimits.alarms, parseAlarm);
  const integrations = parseArray(
    value.integrations,
    projectionLimits.integrations,
    parseIntegration,
  );
  const interactions = parseArray(
    value.interactions,
    projectionLimits.interactions,
    parseInteraction,
  );
  const profile = parseArray(
    value.profile,
    projectionLimits.profiles,
    parseProfile,
  );
  const sources = parseArray(
    value.sources,
    projectionLimits.sources,
    parseSource,
  );
  const tasks = parseArray(value.tasks, projectionLimits.tasks, parseTask);
  const today = parseArray(value.today, projectionLimits.today, parseText);
  return activity &&
    alarms &&
    integrations &&
    interactions &&
    profile &&
    sources &&
    tasks &&
    today
    ? {
        activity,
        alarms,
        integrations,
        interactions,
        profile,
        sources,
        tasks,
        today,
      }
    : undefined;
}

export const emptyAssistantPresentationProjection: AssistantPresentationProjection =
  Object.freeze({
    activity: Object.freeze([]),
    alarms: Object.freeze([]),
    integrations: Object.freeze([]),
    interactions: Object.freeze([]),
    profile: Object.freeze([]),
    sources: Object.freeze([]),
    tasks: Object.freeze([]),
    today: Object.freeze([]),
  });

function parseActivity(value: unknown): PresentationActivityItem | undefined {
  return isRecord(value) &&
    hasExactKeys(value, ["occurredAt", "summary"]) &&
    isText(value.occurredAt) &&
    isText(value.summary)
    ? { occurredAt: value.occurredAt, summary: value.summary }
    : undefined;
}

function parseAlarm(value: unknown): PresentationAlarmItem | undefined {
  return isRecord(value) &&
    hasExactKeys(value, ["id", "label", "scheduledFor", "status"]) &&
    isText(value.id) &&
    isText(value.label) &&
    isText(value.scheduledFor) &&
    isText(value.status)
    ? {
        id: value.id,
        label: value.label,
        scheduledFor: value.scheduledFor,
        status: value.status,
      }
    : undefined;
}

function parseIntegration(
  value: unknown,
): PresentationIntegrationItem | undefined {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["label", "status"]) ||
    !isText(value.label)
  )
    return;
  const status = value.status;
  return status === "degraded" ||
    status === "disabled" ||
    status === "ready" ||
    status === "unavailable"
    ? { label: value.label, status }
    : undefined;
}

function parseInteraction(
  value: unknown,
): PresentationInteractionItem | undefined {
  return isRecord(value) &&
    hasExactKeys(value, ["id", "request", "response"]) &&
    isText(value.id) &&
    isText(value.request) &&
    isText(value.response)
    ? { id: value.id, request: value.request, response: value.response }
    : undefined;
}

function parseProfile(value: unknown): PresentationProfileItem | undefined {
  return isRecord(value) &&
    hasExactKeys(value, ["field", "provenance", "value"]) &&
    isText(value.field) &&
    value.provenance === "user-authored" &&
    isText(value.value)
    ? { field: value.field, provenance: value.provenance, value: value.value }
    : undefined;
}

function parseSource(value: unknown) {
  return isRecord(value) &&
    hasExactKeys(value, ["title", "url"]) &&
    isText(value.title) &&
    isHttpsUrl(value.url)
    ? { title: value.title, url: value.url }
    : undefined;
}

function parseTask(value: unknown): PresentationTaskItem | undefined {
  return isRecord(value) &&
    hasExactKeys(value, ["id", "label", "status"]) &&
    isText(value.id) &&
    isText(value.label) &&
    isText(value.status)
    ? { id: value.id, label: value.label, status: value.status }
    : undefined;
}

function parseText(value: unknown): string | undefined {
  return isText(value) ? value : undefined;
}

function parseArray<TValue>(
  value: unknown,
  maximum: number,
  parse: (item: unknown) => TValue | undefined,
): readonly TValue[] | undefined {
  if (!Array.isArray(value) || value.length > maximum) return;
  const parsed: TValue[] = [];
  for (const item of value) {
    const result = parse(item);
    if (result === undefined) return;
    parsed.push(result);
  }
  return Object.freeze(parsed);
}

function hasExactProjectionKeys(value: Record<string, unknown>): boolean {
  return hasExactKeys(value, [
    "activity",
    "alarms",
    "integrations",
    "interactions",
    "profile",
    "sources",
    "tasks",
    "today",
  ]);
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function isText(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= projectionLimits.textCharacters &&
    !containsControlCharacters(value) &&
    isSpokenTextSafe(value)
  );
}

function isHttpsUrl(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length > projectionLimits.urlCharacters
  )
    return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
