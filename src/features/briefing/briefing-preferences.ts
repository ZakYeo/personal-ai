import { defineCapability } from "../../application/feature.js";
import { isCanonicalTimeZoneIdentifier } from "../../application/temporal-policy.js";
import {
  briefingSections,
  briefingWeekdays,
  type BriefingPreferences,
  type BriefingSection,
  type BriefingStore,
  type BriefingWeekday,
} from "../../ports/briefing.js";
import type {
  FeatureArgsFromParameters,
  FeatureCapabilityParameters,
  FeatureExecutionContext,
} from "../../ports/feature.js";

const showParameters = {} as const satisfies FeatureCapabilityParameters;
const updateParameters = {
  mode: {
    allowedValues: ["short", "standard", "attention-only"],
    type: "string",
  },
  quietEnd: { type: "string" },
  quietHoursEnabled: { type: "boolean" },
  quietStart: { type: "string" },
  sections: { type: "string" },
} as const satisfies FeatureCapabilityParameters;
const topicParameters = {
  topic: { required: true, type: "string" },
} as const satisfies FeatureCapabilityParameters;
const scheduleParameters = {
  localTime: { required: true, type: "string" },
  timeZone: { type: "string" },
  weekdays: { type: "string" },
} as const satisfies FeatureCapabilityParameters;

type UpdateArgs = FeatureArgsFromParameters<typeof updateParameters>;
type TopicArgs = FeatureArgsFromParameters<typeof topicParameters>;
type ScheduleArgs = FeatureArgsFromParameters<typeof scheduleParameters>;

export function createBriefingPreferenceCapabilities(store: BriefingStore) {
  return {
    "briefing.preferences.show": defineCapability({
      description: "Show the current daily briefing schedule and preferences.",
      execute: () => showPreferences(store),
      parameters: showParameters,
      risk: "low",
      spokenSummary: "manage daily briefing preferences",
      summary: "Show daily briefing preferences.",
      toolChain: "read",
    }),
    "briefing.preferences.update": defineCapability({
      description:
        "Update selected briefing sections, spoken length, or local quiet hours.",
      execute: (request, context) =>
        updatePreferences(store, request.args, context),
      parameters: updateParameters,
      risk: "low",
      spokenSummary: "manage daily briefing preferences",
      summary: "Update daily briefing preferences.",
    }),
    "briefing.schedule.disable": defineCapability({
      confirmation: () => ({
        facts: {},
        text: "disable scheduled daily briefings",
      }),
      description:
        "Disable scheduled daily briefing delivery. This requires confirmation.",
      execute: (_request, context) => disableSchedule(store, context),
      parameters: showParameters,
      requiresConfirmation: true,
      risk: "high",
      spokenSummary: "schedule daily briefings",
      summary: "Disable scheduled daily briefings.",
    }),
    "briefing.schedule.set": defineCapability({
      confirmation: (args, context) => {
        const schedule = decodeSchedule(
          args,
          context.config.assistant.timeZone,
        );
        return {
          facts: {
            localTime: schedule.localTime,
            timeZone: schedule.timeZone,
            weekdays: schedule.weekdays.join(","),
          },
          text: `schedule the daily briefing for ${schedule.localTime} in ${schedule.timeZone} on ${schedule.weekdays.join(", ")}`,
        };
      },
      description:
        "Set one scheduled briefing at a local time on selected weekdays. This requires confirmation.",
      execute: (request, context) => setSchedule(store, request.args, context),
      parameters: scheduleParameters,
      requiresConfirmation: true,
      risk: "high",
      spokenSummary: "schedule daily briefings",
      summary: "Set the daily briefing schedule.",
    }),
    "briefing.topic.add": defineCapability({
      description:
        "Add one explicit bounded internet topic to daily briefings.",
      execute: (request, context) => addTopic(store, request.args, context),
      parameters: topicParameters,
      risk: "low",
      spokenSummary: "manage daily briefing topics",
      summary: "Add a daily briefing internet topic.",
    }),
    "briefing.topic.remove": defineCapability({
      description: "Remove one exact internet topic from daily briefings.",
      execute: (request, context) => removeTopic(store, request.args, context),
      parameters: topicParameters,
      risk: "low",
      spokenSummary: "manage daily briefing topics",
      summary: "Remove a daily briefing internet topic.",
    }),
  };
}

async function showPreferences(store: BriefingStore) {
  return preferenceResult(await store.getPreferences());
}

async function updatePreferences(
  store: BriefingStore,
  args: UpdateArgs,
  context: FeatureExecutionContext,
) {
  const current = await store.getPreferences();
  const quietHours = decodeQuietHours(args, current.quietHours);
  const updated = await store.updatePreferences({
    expectedRevision: current.revision,
    preferences: {
      length: args.mode ?? current.length,
      ...(quietHours ? { quietHours } : {}),
      ...(current.schedule ? { schedule: current.schedule } : {}),
      searchTopics: current.searchTopics,
      sections: args.sections
        ? decodeSections(args.sections)
        : current.sections,
    },
    updatedAt: context.clock.now().toISOString(),
  });
  if (!updated)
    return { text: "Briefing preferences changed before I could update them." };
  return preferenceResult(updated);
}

async function addTopic(
  store: BriefingStore,
  args: TopicArgs,
  context: FeatureExecutionContext,
) {
  const topic = normalizeTopic(args.topic);
  const current = await store.getPreferences();
  if (
    current.searchTopics.some(
      (item) => item.toLocaleLowerCase() === topic.toLocaleLowerCase(),
    )
  ) {
    return preferenceResult(current);
  }
  if (current.searchTopics.length >= 3) {
    throw new Error("Daily briefings support at most three internet topics.");
  }
  return savePreferences(store, current, context, {
    ...current,
    searchTopics: [...current.searchTopics, topic],
  });
}

async function removeTopic(
  store: BriefingStore,
  args: TopicArgs,
  context: FeatureExecutionContext,
) {
  const topic = normalizeTopic(args.topic);
  const current = await store.getPreferences();
  return savePreferences(store, current, context, {
    ...current,
    searchTopics: current.searchTopics.filter(
      (item) => item.toLocaleLowerCase() !== topic.toLocaleLowerCase(),
    ),
  });
}

async function setSchedule(
  store: BriefingStore,
  args: ScheduleArgs,
  context: FeatureExecutionContext,
) {
  const current = await store.getPreferences();
  return savePreferences(store, current, context, {
    ...current,
    schedule: decodeSchedule(args, context.config.assistant.timeZone),
  });
}

async function disableSchedule(
  store: BriefingStore,
  context: FeatureExecutionContext,
) {
  const current = await store.getPreferences();
  return savePreferences(store, current, context, {
    length: current.length,
    ...(current.quietHours ? { quietHours: current.quietHours } : {}),
    searchTopics: current.searchTopics,
    sections: current.sections,
  });
}

async function savePreferences(
  store: BriefingStore,
  current: BriefingPreferences,
  context: FeatureExecutionContext,
  next: Omit<BriefingPreferences, "revision" | "updatedAt">,
) {
  const updated = await store.updatePreferences({
    expectedRevision: current.revision,
    preferences: next,
    updatedAt: context.clock.now().toISOString(),
  });
  return updated
    ? preferenceResult(updated)
    : { text: "Briefing preferences changed before I could update them." };
}

function preferenceResult(preferences: BriefingPreferences) {
  const schedule = preferences.schedule;
  return {
    data: {
      length: preferences.length,
      revision: preferences.revision,
      searchTopics: preferences.searchTopics.join(","),
      sections: preferences.sections.join(","),
      ...(schedule
        ? {
            localTime: schedule.localTime,
            timeZone: schedule.timeZone,
            weekdays: schedule.weekdays.join(","),
          }
        : {}),
    },
    responseRewrite: "disabled" as const,
    text: schedule
      ? `Daily briefings are scheduled for ${schedule.localTime} in ${schedule.timeZone} on ${schedule.weekdays.join(", ")}.`
      : "Scheduled daily briefings are disabled.",
  };
}

function decodeSchedule(args: ScheduleArgs, defaultTimeZone: string) {
  const localTime = requireLocalTime(args.localTime);
  const timeZone = args.timeZone ?? defaultTimeZone;
  if (!isCanonicalTimeZoneIdentifier(timeZone)) {
    throw new Error("Briefing timezone must be a canonical IANA timezone.");
  }
  return {
    localTime,
    timeZone,
    weekdays: args.weekdays
      ? decodeWeekdays(args.weekdays)
      : [...briefingWeekdays],
  };
}

function decodeSections(value: string): BriefingSection[] {
  const values = splitList(value);
  if (
    values.length === 0 ||
    values.some((item) => !briefingSections.includes(item as BriefingSection))
  ) {
    throw new Error(
      "Briefing sections must be a non-empty unique supported list.",
    );
  }
  return unique(values) as BriefingSection[];
}

function decodeWeekdays(value: string): BriefingWeekday[] {
  const values = splitList(value);
  if (
    values.length === 0 ||
    values.some((item) => !briefingWeekdays.includes(item as BriefingWeekday))
  ) {
    throw new Error(
      "Briefing weekdays must be a non-empty unique supported list.",
    );
  }
  return unique(values) as BriefingWeekday[];
}

function decodeQuietHours(
  args: UpdateArgs,
  current: BriefingPreferences["quietHours"],
) {
  if (args.quietHoursEnabled === false) return;
  if (args.quietHoursEnabled === true || args.quietStart || args.quietEnd) {
    if (!args.quietStart || !args.quietEnd) {
      throw new Error("Briefing quiet hours require both start and end times.");
    }
    return {
      end: requireLocalTime(args.quietEnd),
      start: requireLocalTime(args.quietStart),
    };
  }
  return current;
}

function requireLocalTime(value: string): string {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(value)) {
    throw new Error("Briefing time must use canonical HH:mm local time.");
  }
  return value;
}

function normalizeTopic(value: string): string {
  const topic = value.trim().replace(/\s+/gu, " ");
  if (topic.length === 0 || topic.length > 120) {
    throw new Error("Briefing topics must contain 1 to 120 characters.");
  }
  return topic;
}

function splitList(value: string): string[] {
  const items = value
    .split(",")
    .map((item) => item.trim().toLocaleLowerCase())
    .filter(Boolean);
  if (unique(items).length !== items.length) {
    throw new Error("Briefing lists cannot contain duplicate values.");
  }
  return items;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
