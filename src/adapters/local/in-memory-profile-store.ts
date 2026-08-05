import {
  assertValidProfileFact,
  cloneProfileFact,
  isSingletonProfileField,
  maximumProfileInterests,
  normalizeProfileMatchValue,
} from "../../application/profile-policy.js";
import type {
  ProfileFact,
  ProfileFactInput,
  ProfileFactSelector,
  ProfileStorePort,
} from "../../ports/profile-store.js";

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
      Promise.resolve().then(() => forgetFact(facts, selector)),
    list: () => Promise.resolve(facts.map(cloneProfileFact)),
    set: (input) => Promise.resolve().then(() => setFact(facts, input)),
  };

  function setFact(
    storedFacts: ProfileFact[],
    input: ProfileFactInput,
  ): ProfileFact {
    const existingIndex = storedFacts.findIndex((fact) =>
      isSingletonProfileField(input.field)
        ? fact.field === input.field
        : fact.field === "interest" &&
          normalizeProfileMatchValue(fact.value) ===
            normalizeProfileMatchValue(input.value),
    );
    const existing = storedFacts[existingIndex];
    if (
      existing &&
      (existing.value === input.value || input.field === "interest")
    ) {
      return cloneProfileFact(existing);
    }
    if (
      input.field === "interest" &&
      existing === undefined &&
      storedFacts.filter(({ field }) => field === "interest").length >=
        maximumProfileInterests
    ) {
      throw new Error(
        `A personal profile may contain at most ${maximumProfileInterests} interests.`,
      );
    }
    const timestamp = options.now().toISOString();
    const fact: ProfileFact = {
      createdAt: existing?.createdAt ?? timestamp,
      field: input.field,
      provenance: "user-authored",
      updatedAt: timestamp,
      value: input.value,
    };
    assertValidProfileFact(fact);
    if (existingIndex === -1) storedFacts.push(fact);
    else storedFacts[existingIndex] = fact;
    return cloneProfileFact(fact);
  }
}

function forgetFact(
  facts: ProfileFact[],
  selector: ProfileFactSelector,
): ProfileFact | undefined {
  const index = facts.findIndex(
    (fact) =>
      fact.field === selector.field &&
      (selector.value === undefined ||
        normalizeProfileMatchValue(fact.value) ===
          normalizeProfileMatchValue(selector.value)),
  );
  const fact = facts[index];
  if (!fact) return;
  facts.splice(index, 1);
  return cloneProfileFact(fact);
}
