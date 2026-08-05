import { cloneProfileFact } from "../../application/profile-policy.js";
import type {
  ProfileFact,
  ProfileStorePort,
} from "../../ports/profile-store.js";
import {
  forgetStoredProfileFact,
  setStoredProfileFact,
} from "./profile-store-state.js";

interface InMemoryProfileStoreOptions {
  now: () => Date;
}

export function createInMemoryProfileStore(
  options: InMemoryProfileStoreOptions,
): ProfileStorePort {
  const facts: ProfileFact[] = [];

  return {
    clear: () =>
      Promise.resolve().then(() => {
        const removed = facts.map(cloneProfileFact);
        facts.splice(0);
        return removed;
      }),
    forget: (selector) =>
      Promise.resolve().then(() => forgetStoredProfileFact(facts, selector)),
    list: () => Promise.resolve(facts.map(cloneProfileFact)),
    set: (input) =>
      Promise.resolve().then(
        () => setStoredProfileFact(facts, input, options.now()).fact,
      ),
  };
}
