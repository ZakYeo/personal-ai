import type {
  BriefingPreferences,
  BriefingSnapshot,
  BriefingStore,
} from "../../ports/briefing.js";

interface InMemoryBriefingStoreOptions {
  readonly now: () => Date;
  readonly sections?: BriefingPreferences["sections"];
  readonly timeZone: string;
}

export function createInMemoryBriefingStore(
  options: InMemoryBriefingStoreOptions,
): BriefingStore {
  let preferences: BriefingPreferences = {
    length: "standard",
    quietHours: { end: "07:00", start: "22:00" },
    revision: 1,
    searchTopics: [],
    sections: options.sections ?? [
      "profile",
      "calendar",
      "weather",
      "alarms",
      "tasks",
    ],
    updatedAt: options.now().toISOString(),
  };
  let snapshot: BriefingSnapshot | undefined;
  const slots = new Map<string, "claimed" | "delivered" | "skipped">();
  return {
    claimDeliverySlot: ({ id }) => {
      if (slots.has(id)) return Promise.resolve(false);
      slots.set(id, "claimed");
      return Promise.resolve(true);
    },
    completeDeliverySlot: ({ id, snapshot: deliveredSnapshot }) => {
      if (slots.get(id) !== "claimed") return Promise.resolve(false);
      slots.set(id, "delivered");
      snapshot = cloneSnapshot(deliveredSnapshot);
      return Promise.resolve(true);
    },
    getLastSnapshot: () => Promise.resolve(cloneSnapshot(snapshot)),
    getPreferences: () => Promise.resolve(clonePreferences(preferences)),
    saveSnapshot: (next) => {
      snapshot = cloneSnapshot(next);
      return Promise.resolve();
    },
    skipDeliverySlot: ({ id }) => {
      if (slots.has(id)) return Promise.resolve(false);
      slots.set(id, "skipped");
      return Promise.resolve(true);
    },
    updatePreferences: (update) => {
      if (preferences.revision !== update.expectedRevision) {
        return Promise.resolve(undefined);
      }
      preferences = {
        ...update.preferences,
        revision: preferences.revision + 1,
        updatedAt: update.updatedAt,
      };
      return Promise.resolve(clonePreferences(preferences));
    },
  };
}

function clonePreferences(value: BriefingPreferences): BriefingPreferences {
  return structuredClone(value);
}

function cloneSnapshot(
  value: BriefingSnapshot | undefined,
): BriefingSnapshot | undefined {
  return value === undefined ? undefined : structuredClone(value);
}
