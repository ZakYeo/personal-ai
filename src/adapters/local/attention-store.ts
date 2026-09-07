import type { AttentionState, AttentionStore } from "../../ports/attention.js";
import { createAttentionPreferences } from "../../application/attention-policy.js";
import { createSerializedExecutor } from "./serialized-executor.js";
import {
  readLocalJsonState,
  writeLocalJsonState,
  type LocalJsonStateFileSystem,
} from "./json-state-file.js";
import { createNodeLocalJsonStateFileSystem } from "./node-local-json-state-file-system.js";
import { parseAttentionState } from "./attention-state-schema.js";
import { assertAttentionStateTransition } from "./attention-state-transition.js";

export function createInMemoryAttentionStore(options: {
  timeZone: string;
}): AttentionStore {
  let state = emptyState(options.timeZone);
  return createStore({
    read: () => Promise.resolve(state),
    write: (next) => {
      state = next;
      return Promise.resolve();
    },
  });
}

export function createFileAttentionStore(options: {
  filePath: string;
  timeZone: string;
  fileSystem?: LocalJsonStateFileSystem;
}): AttentionStore {
  const fileSystem = options.fileSystem ?? createNodeLocalJsonStateFileSystem();
  const initial = emptyState(options.timeZone);
  return createStore({
    read: () =>
      readLocalJsonState({
        filePath: options.filePath,
        fileSystem,
        invalidJsonMessage: "Attention state contains invalid JSON.",
        missingState: () => initial,
        parse: parseAttentionState,
        readFailureMessage: "Could not read attention state.",
      }),
    write: (state) =>
      writeLocalJsonState({
        filePath: options.filePath,
        fileSystem,
        persistenceFailureMessage: "Could not persist attention state.",
        state,
      }),
  });
}

function createStore(storage: {
  read(): Promise<AttentionState>;
  write(state: AttentionState): Promise<void>;
}): AttentionStore {
  const enqueue = createSerializedExecutor();
  return {
    read: () => enqueue(async () => parseAttentionState(await storage.read())),
    replace: (expectedRevision, proposed) => {
      const next = parseAttentionState(proposed);
      return enqueue(async () => {
        const previous = await storage.read();
        if (previous.revision !== expectedRevision) return false;
        assertAttentionStateTransition(previous, next);
        await storage.write(next);
        return true;
      });
    },
  };
}

function emptyState(timeZone: string): AttentionState {
  return {
    version: 1,
    revision: 1,
    nextId: 1,
    preferences: createAttentionPreferences(timeZone),
    rules: [],
    inbox: [],
    evaluations: [],
  };
}
