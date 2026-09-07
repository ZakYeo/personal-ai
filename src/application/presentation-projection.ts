import { parsePresentationAttentionItem } from "./presentation-attention.js";
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
import { humanizeSpokenText, isSpokenTextSafe } from "./human-text.js";

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

/** Builds bounded display fields; opaque IDs and link targets remain exact. */
export function buildAssistantPresentationProjection(
  value: AssistantPresentationProjection,
  context: { now: Date; timeZone: string },
): AssistantPresentationProjection {
  const text = (value: string) => {
    const printable = [...value]
      .map((character) =>
        containsControlCharacters(character) ? " " : character,
      )
      .join("");
    const safe = humanizeSpokenText(printable, {
      ...context,
      assistantTimeZone: context.timeZone,
    });
    return safe.length <= projectionLimits.textCharacters
      ? safe
      : `${safe.slice(0, projectionLimits.textCharacters - 1)}…`;
  };
  const projection = parseAssistantPresentationProjection({
    attention: value.attention.slice(0, 50).map((item) => ({
      id: item.id,
      revision: item.revision,
      title: text(item.title),
      text: text(item.text),
      explanation: text(item.explanation),
      provenance: text(item.provenance),
      recordedAt: text(item.recordedAt),
      status: text(item.status),
      delivery: text(item.delivery),
      canResolveReminder: item.canResolveReminder,
    })),
    activity: value.activity
      .slice(0, projectionLimits.activities)
      .map((item) => ({
        occurredAt: text(item.occurredAt),
        summary: text(item.summary),
      })),
    alarms: value.alarms.slice(0, projectionLimits.alarms).map((item) => ({
      ...item,
      label: text(item.label),
      scheduledFor: text(item.scheduledFor),
      status: text(item.status),
    })),
    integrations: value.integrations
      .slice(0, projectionLimits.integrations)
      .map((item) => ({
        ...item,
        label: text(item.label),
        lastCheck: text(item.lastCheck),
      })),
    interactions: value.interactions
      .slice(0, projectionLimits.interactions)
      .map((item) => ({
        ...item,
        request: text(item.request),
        response: text(item.response),
      })),
    profile: value.profile
      .slice(0, projectionLimits.profiles)
      .map((item) => ({ ...item, value: text(item.value) })),
    sources: value.sources
      .slice(0, projectionLimits.sources)
      .map((item) => ({ ...item, title: text(item.title) })),
    tasks: value.tasks.slice(0, projectionLimits.tasks).map((item) => ({
      ...item,
      label: text(item.label),
      status: text(item.status),
    })),
    today: value.today.slice(0, projectionLimits.today).map(text),
  });
  if (!projection)
    throw new Error("Presentation projection failed canonical validation.");
  return projection;
}

export function parseAssistantPresentationProjection(
  value: unknown,
): AssistantPresentationProjection | undefined {
  if (!isRecord(value) || !hasExactProjectionKeys(value)) return;
  const attention = parseArray(
    value.attention,
    50,
    parsePresentationAttentionItem,
  );
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
  return attention &&
    activity &&
    alarms &&
    integrations &&
    interactions &&
    profile &&
    sources &&
    tasks &&
    today
    ? {
        attention,
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
    attention: Object.freeze([]),
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
    !hasExactKeys(value, ["label", "lastCheck", "status"]) ||
    !isText(value.lastCheck) ||
    !isText(value.label)
  )
    return;
  const status = value.status;
  return status === "degraded" ||
    status === "disabled" ||
    status === "configured" ||
    status === "connected" ||
    status === "unchecked"
    ? { label: value.label, lastCheck: value.lastCheck, status }
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
    hasExactKeys(value, ["field", "provenance", "reference", "value"]) &&
    isText(value.field) &&
    isText(value.reference) &&
    value.provenance === "user-authored" &&
    isText(value.value)
    ? {
        field: value.field,
        provenance: value.provenance,
        reference: value.reference,
        value: value.value,
      }
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
    "attention",
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
