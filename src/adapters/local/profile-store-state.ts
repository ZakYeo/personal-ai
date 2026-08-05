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
} from "../../ports/profile-store.js";

export const maximumProfileFacts = maximumProfileInterests + 6;

export function setStoredProfileFact(
  facts: ProfileFact[],
  input: ProfileFactInput,
  now: Date,
): { changed: boolean; fact: ProfileFact } {
  const existingIndex = facts.findIndex((fact) =>
    isSingletonProfileField(input.field)
      ? fact.field === input.field
      : fact.field === "interest" &&
        normalizeProfileMatchValue(fact.value) ===
          normalizeProfileMatchValue(input.value),
  );
  const existing = facts[existingIndex];
  if (
    existing &&
    (existing.value === input.value || input.field === "interest")
  ) {
    return { changed: false, fact: cloneProfileFact(existing) };
  }
  if (
    input.field === "interest" &&
    existing === undefined &&
    facts.filter(({ field }) => field === "interest").length >=
      maximumProfileInterests
  ) {
    throw new Error(
      `A personal profile may contain at most ${maximumProfileInterests} interests.`,
    );
  }
  const timestamp = now.toISOString();
  const fact: ProfileFact = {
    createdAt: existing?.createdAt ?? timestamp,
    field: input.field,
    provenance: "user-authored",
    updatedAt: timestamp,
    value: input.value,
  };
  assertValidProfileFact(fact);
  if (existingIndex === -1) facts.push(fact);
  else facts[existingIndex] = fact;
  return { changed: true, fact: cloneProfileFact(fact) };
}

export function forgetStoredProfileFact(
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

export function assertValidProfileFacts(facts: readonly ProfileFact[]): void {
  const interestCount = facts.filter(
    ({ field }) => field === "interest",
  ).length;
  if (interestCount > maximumProfileInterests) {
    throw new Error(
      `Profile state cannot contain more than ${maximumProfileInterests} interests.`,
    );
  }
  if (facts.length > maximumProfileFacts) {
    throw new Error("Profile state contains too many facts.");
  }
  for (const fact of facts) assertValidProfileFact(fact);

  const singletonFields = facts
    .filter(({ field }) => isSingletonProfileField(field))
    .map(({ field }) => field);
  if (new Set(singletonFields).size !== singletonFields.length) {
    throw new Error("Profile state contains duplicate singleton facts.");
  }
  const interests = facts
    .filter(({ field }) => field === "interest")
    .map(({ value }) => normalizeProfileMatchValue(value));
  if (new Set(interests).size !== interests.length) {
    throw new Error("Profile state contains duplicate interests.");
  }
}
