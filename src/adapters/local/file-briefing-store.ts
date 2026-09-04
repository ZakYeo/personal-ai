import type {
  BriefingPreferences,
  BriefingSnapshot,
  BriefingStore,
} from "../../ports/briefing.js";
import { briefingSections, briefingWeekdays } from "../../ports/briefing.js";
import {
  isCanonicalIsoTimestamp,
  isCanonicalTimeZoneIdentifier,
} from "../../application/temporal-policy.js";
import { isRecord } from "../parsing.js";
import {
  readLocalJsonState,
  type LocalJsonStateFileSystem,
  writeLocalJsonState,
} from "./json-state-file.js";
import { createNodeLocalJsonStateFileSystem } from "./node-local-json-state-file-system.js";
import { createSerializedExecutor } from "./serialized-executor.js";

interface BriefingStateDocument {
  readonly lastSnapshot?: BriefingSnapshot;
  readonly preferences: BriefingPreferences;
  readonly version: 1;
}

interface FileBriefingStoreOptions {
  readonly filePath: string;
  readonly fileSystem?: LocalJsonStateFileSystem;
  readonly now: () => Date;
  readonly timeZone: string;
}

export function createFileBriefingStore(
  options: FileBriefingStoreOptions,
): BriefingStore {
  const fileSystem = options.fileSystem ?? createNodeLocalJsonStateFileSystem();
  const enqueue = createSerializedExecutor();
  return {
    getLastSnapshot: () =>
      enqueue(async () =>
        cloneSnapshot((await readState(options, fileSystem)).lastSnapshot),
      ),
    getPreferences: () =>
      enqueue(async () =>
        clonePreferences((await readState(options, fileSystem)).preferences),
      ),
    saveSnapshot: (snapshot) =>
      enqueue(async () => {
        const state = await readState(options, fileSystem);
        await writeState(
          options.filePath,
          { ...state, lastSnapshot: cloneSnapshot(snapshot) },
          fileSystem,
        );
      }),
    updatePreferences: (update) =>
      enqueue(async () => {
        const state = await readState(options, fileSystem);
        if (state.preferences.revision !== update.expectedRevision) return;
        const preferences: BriefingPreferences = {
          ...update.preferences,
          revision: state.preferences.revision + 1,
          updatedAt: update.updatedAt,
        };
        assertPreferences(preferences);
        await writeState(
          options.filePath,
          { ...state, preferences },
          fileSystem,
        );
        return clonePreferences(preferences);
      }),
  };
}

function readState(
  options: FileBriefingStoreOptions,
  fileSystem: LocalJsonStateFileSystem,
): Promise<BriefingStateDocument> {
  return readLocalJsonState({
    filePath: options.filePath,
    fileSystem,
    invalidJsonMessage: "Briefing state file contains invalid JSON.",
    maxBytes: 256 * 1024,
    missingState: () => ({
      preferences: defaultPreferences(options.now()),
      version: 1,
    }),
    parse: parseState,
    readFailureMessage: "Could not read briefing state.",
  });
}

function writeState(
  filePath: string,
  state: BriefingStateDocument,
  fileSystem: LocalJsonStateFileSystem,
): Promise<void> {
  assertPreferences(state.preferences);
  if (state.lastSnapshot) assertSnapshot(state.lastSnapshot);
  return writeLocalJsonState({
    filePath,
    fileSystem,
    persistenceFailureMessage: "Could not persist briefing state.",
    state,
  });
}

function parseState(value: unknown): BriefingStateDocument {
  if (!isRecord(value) || value.version !== 1) throw invalidState();
  const preferences = parsePreferences(value.preferences);
  const lastSnapshot =
    value.lastSnapshot === undefined
      ? undefined
      : parseSnapshot(value.lastSnapshot);
  return {
    ...(lastSnapshot ? { lastSnapshot } : {}),
    preferences,
    version: 1,
  };
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
  const preferences: BriefingPreferences = {
    length: value.length,
    revision: value.revision as number,
    searchTopics: value.searchTopics.map(requireString),
    sections: value.sections.map(requireSection),
    updatedAt: value.updatedAt,
    ...(value.quietHours === undefined
      ? {}
      : { quietHours: parseQuietHours(value.quietHours) }),
    ...(value.schedule === undefined
      ? {}
      : { schedule: parseSchedule(value.schedule) }),
  };
  assertPreferences(preferences);
  return preferences;
}

function parseSnapshot(value: unknown): BriefingSnapshot {
  if (
    !isRecord(value) ||
    !isCanonicalIsoTimestamp(value.createdAt) ||
    !Array.isArray(value.sections) ||
    !isCanonicalTimeZoneIdentifier(value.timeZone)
  )
    throw invalidState();
  const snapshot: BriefingSnapshot = {
    createdAt: value.createdAt,
    sections: value.sections.map((section) => {
      if (
        !isRecord(section) ||
        typeof section.available !== "boolean" ||
        !Array.isArray(section.items)
      ) {
        throw invalidState();
      }
      return {
        available: section.available,
        items: section.items.map((item) => {
          if (
            !isRecord(item) ||
            typeof item.key !== "string" ||
            typeof item.text !== "string"
          )
            throw invalidState();
          return { key: item.key, text: item.text };
        }),
        section: requireSection(section.section),
      };
    }),
    timeZone: value.timeZone,
  };
  assertSnapshot(snapshot);
  return snapshot;
}

function defaultPreferences(now: Date): BriefingPreferences {
  return {
    length: "standard",
    quietHours: { end: "07:00", start: "22:00" },
    revision: 1,
    searchTopics: [],
    sections: ["profile", "calendar", "weather", "alarms", "tasks"],
    updatedAt: now.toISOString(),
  };
}

function assertPreferences(value: BriefingPreferences): void {
  if (
    value.sections.length === 0 ||
    new Set(value.sections).size !== value.sections.length ||
    value.searchTopics.length > 3 ||
    value.searchTopics.some(
      (topic) => topic.length === 0 || topic.length > 120,
    ) ||
    !isCanonicalIsoTimestamp(value.updatedAt)
  )
    throw invalidState();
}

function assertSnapshot(value: BriefingSnapshot): void {
  if (
    value.sections.length > briefingSections.length ||
    value.sections.some(
      (section) =>
        section.items.length > 20 ||
        section.items.some(
          (item) => item.key.length > 160 || item.text.length > 500,
        ),
    )
  )
    throw invalidState();
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
  if (weekdays.length === 0 || new Set(weekdays).size !== weekdays.length)
    throw invalidState();
  return { localTime: value.localTime, timeZone: value.timeZone, weekdays };
}

function requireSection(value: unknown): (typeof briefingSections)[number] {
  if (
    typeof value !== "string" ||
    !briefingSections.includes(value as (typeof briefingSections)[number])
  )
    throw invalidState();
  return value as (typeof briefingSections)[number];
}

function requireString(value: unknown): string {
  if (typeof value !== "string") throw invalidState();
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

function clonePreferences(value: BriefingPreferences): BriefingPreferences {
  return structuredClone(value);
}

function cloneSnapshot(value: BriefingSnapshot): BriefingSnapshot;
function cloneSnapshot(value: undefined): undefined;
function cloneSnapshot(
  value: BriefingSnapshot | undefined,
): BriefingSnapshot | undefined;
function cloneSnapshot(
  value: BriefingSnapshot | undefined,
): BriefingSnapshot | undefined {
  return value === undefined ? undefined : structuredClone(value);
}
