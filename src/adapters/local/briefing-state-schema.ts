import {
  briefingSections,
  briefingWeekdays,
  type BriefingDeliverySlot,
  type BriefingPreferences,
  type BriefingSection,
  type BriefingSnapshot,
} from "../../ports/briefing.js";
import {
  isCanonicalIsoTimestamp,
  isCanonicalTimeZoneIdentifier,
} from "../../application/temporal-policy.js";
import { isRecord } from "../parsing.js";

export interface BriefingStateDocument {
  readonly lastSnapshot?: BriefingSnapshot;
  readonly preferences: BriefingPreferences;
  readonly slots: readonly BriefingDeliverySlot[];
  readonly version: 1;
}

export function parseBriefingState(value: unknown): BriefingStateDocument {
  if (!isRecord(value) || value.version !== 1) throw invalidState();
  const lastSnapshot =
    value.lastSnapshot === undefined
      ? undefined
      : parseSnapshot(value.lastSnapshot);
  return {
    ...(lastSnapshot ? { lastSnapshot } : {}),
    preferences: parsePreferences(value.preferences),
    slots: value.slots === undefined ? [] : parseSlots(value.slots),
    version: 1,
  };
}

export function assertBriefingState(value: BriefingStateDocument): void {
  parseBriefingState(value);
}

function parseSlots(value: unknown): BriefingDeliverySlot[] {
  if (!Array.isArray(value) || value.length > 100) throw invalidState();
  const slots = value.map(parseSlot);
  if (new Set(slots.map(({ id }) => id)).size !== slots.length) {
    throw invalidState();
  }
  return slots;
}

function parseSlot(value: unknown): BriefingDeliverySlot {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    value.id.trim().length === 0 ||
    value.id.length > 240
  ) {
    throw invalidState();
  }
  if (value.status === "claimed") {
    if (
      !isCanonicalIsoTimestamp(value.claimedAt) ||
      value.deliveredAt !== undefined ||
      value.skippedAt !== undefined
    )
      throw invalidState();
    return { claimedAt: value.claimedAt, id: value.id, status: "claimed" };
  }
  if (value.status === "delivered") {
    if (
      !isCanonicalIsoTimestamp(value.claimedAt) ||
      !isCanonicalIsoTimestamp(value.deliveredAt) ||
      value.skippedAt !== undefined ||
      value.deliveredAt < value.claimedAt
    )
      throw invalidState();
    return {
      claimedAt: value.claimedAt,
      deliveredAt: value.deliveredAt,
      id: value.id,
      status: "delivered",
    };
  }
  if (value.status === "skipped") {
    if (
      !isCanonicalIsoTimestamp(value.skippedAt) ||
      value.claimedAt !== undefined ||
      value.deliveredAt !== undefined
    )
      throw invalidState();
    return { id: value.id, skippedAt: value.skippedAt, status: "skipped" };
  }
  throw invalidState();
}

function parsePreferences(value: unknown): BriefingPreferences {
  if (
    !isRecord(value) ||
    !isLength(value.length) ||
    !Number.isInteger(value.revision) ||
    (value.revision as number) < 1 ||
    !Array.isArray(value.sections) ||
    !Array.isArray(value.searchTopics) ||
    !isCanonicalIsoTimestamp(value.updatedAt)
  )
    throw invalidState();
  const sections = value.sections.map(requireSection);
  const searchTopics = value.searchTopics.map(requireTopic);
  if (
    sections.length === 0 ||
    new Set(sections).size !== sections.length ||
    searchTopics.length > 3 ||
    new Set(searchTopics.map((topic) => topic.toLocaleLowerCase())).size !==
      searchTopics.length
  )
    throw invalidState();
  return {
    length: value.length,
    revision: value.revision as number,
    searchTopics,
    sections,
    updatedAt: value.updatedAt,
    ...(value.quietHours === undefined
      ? {}
      : { quietHours: parseQuietHours(value.quietHours) }),
    ...(value.schedule === undefined
      ? {}
      : { schedule: parseSchedule(value.schedule) }),
  };
}

function parseSnapshot(value: unknown): BriefingSnapshot {
  if (
    !isRecord(value) ||
    !isCanonicalIsoTimestamp(value.createdAt) ||
    !Array.isArray(value.sections) ||
    value.sections.length > briefingSections.length ||
    !isCanonicalTimeZoneIdentifier(value.timeZone)
  )
    throw invalidState();
  const sections = value.sections.map(parseSnapshotSection);
  if (
    new Set(sections.map(({ section }) => section)).size !== sections.length
  ) {
    throw invalidState();
  }
  return { createdAt: value.createdAt, sections, timeZone: value.timeZone };
}

function parseSnapshotSection(value: unknown) {
  if (
    !isRecord(value) ||
    typeof value.available !== "boolean" ||
    !Array.isArray(value.items) ||
    value.items.length > 20
  )
    throw invalidState();
  const items = value.items.map((item) => {
    if (
      !isRecord(item) ||
      typeof item.key !== "string" ||
      item.key.trim().length === 0 ||
      item.key.length > 160 ||
      typeof item.text !== "string" ||
      item.text.trim().length === 0 ||
      item.text.length > 500
    )
      throw invalidState();
    return { key: item.key, text: item.text };
  });
  if (
    (!value.available && items.length > 0) ||
    new Set(items.map(({ key }) => key)).size !== items.length
  )
    throw invalidState();
  return {
    available: value.available,
    items,
    section: requireSection(value.section),
  };
}

function parseQuietHours(value: unknown) {
  if (!isRecord(value) || !isLocalTime(value.start) || !isLocalTime(value.end))
    throw invalidState();
  return { end: value.end, start: value.start };
}

function parseSchedule(value: unknown) {
  if (
    !isRecord(value) ||
    !isLocalTime(value.localTime) ||
    !isCanonicalTimeZoneIdentifier(value.timeZone) ||
    !Array.isArray(value.weekdays)
  )
    throw invalidState();
  const weekdays = value.weekdays.map((weekday) => {
    if (
      typeof weekday !== "string" ||
      !briefingWeekdays.includes(weekday as (typeof briefingWeekdays)[number])
    )
      throw invalidState();
    return weekday as (typeof briefingWeekdays)[number];
  });
  if (weekdays.length === 0 || new Set(weekdays).size !== weekdays.length) {
    throw invalidState();
  }
  return { localTime: value.localTime, timeZone: value.timeZone, weekdays };
}

function requireSection(value: unknown): BriefingSection {
  if (
    typeof value !== "string" ||
    !briefingSections.includes(value as BriefingSection)
  )
    throw invalidState();
  return value as BriefingSection;
}

function requireTopic(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length === 0 ||
    value.length > 120
  )
    throw invalidState();
  return value;
}

function isLength(value: unknown): value is BriefingPreferences["length"] {
  return (
    value === "short" || value === "standard" || value === "attention-only"
  );
}

function isLocalTime(value: unknown): value is string {
  return (
    typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(value)
  );
}

function invalidState(): Error {
  return new Error("Briefing state contains invalid state.");
}
