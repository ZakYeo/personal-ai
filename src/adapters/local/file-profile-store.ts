import { cloneProfileFact } from "../../application/profile-policy.js";
import type { ProfileStorePort } from "../../ports/profile-store.js";
import {
  readLocalJsonState,
  type LocalJsonStateFileSystem,
  writeLocalJsonState,
} from "./json-state-file.js";
import { createNodeLocalJsonStateFileSystem } from "./node-local-json-state-file-system.js";
import {
  assertValidProfileState,
  parseProfileState,
  type ProfileStateDocument,
} from "./profile-state-schema.js";
import {
  forgetStoredProfileFact,
  setStoredProfileFact,
} from "./profile-store-state.js";
import { createSerializedExecutor } from "./serialized-executor.js";

export type ProfileStoreFileSystem = LocalJsonStateFileSystem;

export interface FileProfileStoreDependencies {
  fileSystem?: ProfileStoreFileSystem;
}

interface FileProfileStoreOptions extends FileProfileStoreDependencies {
  filePath: string;
  now: () => Date;
}

export function createFileProfileStore(
  options: FileProfileStoreOptions,
): ProfileStorePort {
  const fileSystem = options.fileSystem ?? createNodeLocalJsonStateFileSystem();
  const enqueue = createSerializedExecutor();

  return {
    clear: () =>
      enqueue(async () => {
        const state = await readState(options.filePath, fileSystem);
        if (state.facts.length === 0) return [];
        const removed = state.facts.map(cloneProfileFact);
        await writeState(options.filePath, { ...state, facts: [] }, fileSystem);
        return removed;
      }),
    forget: (selector) =>
      enqueue(async () => {
        const state = await readState(options.filePath, fileSystem);
        const removed = forgetStoredProfileFact(state.facts, selector);
        if (!removed) return;
        await writeState(options.filePath, state, fileSystem);
        return removed;
      }),
    list: () =>
      enqueue(async () => {
        const state = await readState(options.filePath, fileSystem);
        return state.facts.map(cloneProfileFact);
      }),
    set: (input) =>
      enqueue(async () => {
        const state = await readState(options.filePath, fileSystem);
        const result = setStoredProfileFact(state.facts, input, options.now());
        if (result.changed) {
          await writeState(options.filePath, state, fileSystem);
        }
        return result.fact;
      }),
  };
}

function readState(
  filePath: string,
  fileSystem: ProfileStoreFileSystem,
): Promise<ProfileStateDocument> {
  return readLocalJsonState({
    filePath,
    fileSystem,
    invalidJsonMessage: "Profile state file contains invalid JSON.",
    maxBytes: 128 * 1024,
    missingState: () => ({ facts: [], version: 1 }),
    parse: parseProfileState,
    readFailureMessage: "Could not read profile state.",
  });
}

function writeState(
  filePath: string,
  state: ProfileStateDocument,
  fileSystem: ProfileStoreFileSystem,
): Promise<void> {
  assertValidProfileState(state);
  return writeLocalJsonState({
    filePath,
    fileSystem,
    persistenceFailureMessage: "Could not persist profile state.",
    state,
  });
}
