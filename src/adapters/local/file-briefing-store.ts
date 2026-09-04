import {
  cloneBriefingPreferences,
  cloneBriefingSnapshot,
  createDefaultBriefingPreferences,
  pruneBriefingDeliverySlots,
} from "../../application/briefing-state-policy.js";
import type {
  BriefingPreferences,
  BriefingStore,
} from "../../ports/briefing.js";
import {
  assertBriefingState,
  type BriefingStateDocument,
  parseBriefingState,
} from "./briefing-state-schema.js";
import {
  readLocalJsonState,
  type LocalJsonStateFileSystem,
  writeLocalJsonState,
} from "./json-state-file.js";
import { createNodeLocalJsonStateFileSystem } from "./node-local-json-state-file-system.js";
import { createSerializedExecutor } from "./serialized-executor.js";

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
  const read = () => readState(options, fileSystem);
  const write = (state: BriefingStateDocument) =>
    writeState(options.filePath, state, fileSystem);
  return {
    claimDeliverySlot: (slot) =>
      enqueue(async () => {
        const state = await read();
        if (state.slots.some(({ id }) => id === slot.id)) return false;
        await write({
          ...state,
          slots: pruneBriefingDeliverySlots(
            [...state.slots, { ...slot, status: "claimed" }],
            options.now(),
          ),
        });
        return true;
      }),
    completeDeliverySlot: (completion) =>
      enqueue(async () => {
        const state = await read();
        const claimed = state.slots.find(
          (slot) => slot.id === completion.id && slot.status === "claimed",
        );
        if (!claimed || claimed.status !== "claimed") return false;
        await write({
          ...state,
          lastSnapshot: cloneBriefingSnapshot(completion.snapshot),
          slots: state.slots.map((slot) =>
            slot === claimed
              ? {
                  claimedAt: claimed.claimedAt,
                  deliveredAt: completion.deliveredAt,
                  id: completion.id,
                  status: "delivered" as const,
                }
              : slot,
          ),
        });
        return true;
      }),
    getLastSnapshot: () =>
      enqueue(async () => cloneBriefingSnapshot((await read()).lastSnapshot)),
    getPreferences: () =>
      enqueue(async () => cloneBriefingPreferences((await read()).preferences)),
    saveSnapshot: (snapshot) =>
      enqueue(async () => {
        const state = await read();
        await write({
          ...state,
          lastSnapshot: cloneBriefingSnapshot(snapshot),
        });
      }),
    skipDeliverySlot: (slot) =>
      enqueue(async () => {
        const state = await read();
        if (state.slots.some(({ id }) => id === slot.id)) return false;
        await write({
          ...state,
          slots: pruneBriefingDeliverySlots(
            [...state.slots, { ...slot, status: "skipped" }],
            options.now(),
          ),
        });
        return true;
      }),
    updatePreferences: (update) =>
      enqueue(async () => {
        const state = await read();
        if (state.preferences.revision !== update.expectedRevision) return;
        const preferences: BriefingPreferences = {
          ...update.preferences,
          revision: state.preferences.revision + 1,
          updatedAt: update.updatedAt,
        };
        const next = { ...state, preferences };
        assertBriefingState(next);
        await write(next);
        return cloneBriefingPreferences(preferences);
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
    missingState: (): BriefingStateDocument => ({
      preferences: createDefaultBriefingPreferences(options.now()),
      slots: [],
      version: 1,
    }),
    parse: parseBriefingState,
    readFailureMessage: "Could not read briefing state.",
  });
}

function writeState(
  filePath: string,
  state: BriefingStateDocument,
  fileSystem: LocalJsonStateFileSystem,
): Promise<void> {
  assertBriefingState(state);
  return writeLocalJsonState({
    filePath,
    fileSystem,
    persistenceFailureMessage: "Could not persist briefing state.",
    state,
  });
}
