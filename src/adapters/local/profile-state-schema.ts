import { isRecord } from "../parsing.js";
import {
  isProfileField,
  maximumProfileInterests,
} from "../../application/profile-policy.js";
import type { ProfileFact } from "../../ports/profile-store.js";
import {
  assertValidProfileFacts,
  maximumProfileFacts,
} from "./profile-store-state.js";

export interface ProfileStateDocument {
  facts: ProfileFact[];
  version: 1;
}

const profileFactKeys = new Set([
  "createdAt",
  "field",
  "provenance",
  "updatedAt",
  "value",
]);

export function parseProfileState(input: unknown): ProfileStateDocument {
  if (!isRecord(input)) {
    throw new Error("Profile state must be a JSON object.");
  }
  if (input.version !== 1) {
    throw new Error("Profile state has an unsupported version.");
  }
  if (!Array.isArray(input.facts)) {
    throw new Error("Profile state contains an invalid facts collection.");
  }
  const interestCount = input.facts.filter(
    (fact) => isRecord(fact) && fact.field === "interest",
  ).length;
  if (interestCount > maximumProfileInterests) {
    throw new Error(
      `Profile state cannot contain more than ${maximumProfileInterests} interests.`,
    );
  }
  if (input.facts.length > maximumProfileFacts) {
    throw new Error(
      `Profile state cannot contain more than ${maximumProfileFacts} facts.`,
    );
  }
  const facts = input.facts.map(parseProfileFact);
  assertValidProfileFacts(facts);
  return { facts, version: 1 };
}

export function assertValidProfileState(state: ProfileStateDocument): void {
  if (state.version !== 1) {
    throw new Error("Profile state has an unsupported version.");
  }
  assertValidProfileFacts(state.facts);
}

function parseProfileFact(input: unknown): ProfileFact {
  if (
    !isRecord(input) ||
    Object.keys(input).some((key) => !profileFactKeys.has(key)) ||
    Object.keys(input).length !== profileFactKeys.size ||
    typeof input.createdAt !== "string" ||
    typeof input.field !== "string" ||
    !isProfileField(input.field) ||
    input.provenance !== "user-authored" ||
    typeof input.updatedAt !== "string" ||
    typeof input.value !== "string"
  ) {
    throw new Error("Profile state contains invalid fact state.");
  }
  return {
    createdAt: input.createdAt,
    field: input.field,
    provenance: input.provenance,
    updatedAt: input.updatedAt,
    value: input.value,
  };
}
