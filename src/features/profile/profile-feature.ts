import { defineDeterministicFeatureRules } from "../../application/deterministic-feature-rules.js";
import { defineCapability, defineFeature } from "../../application/feature.js";
import type { FeatureCapabilityParameters } from "../../ports/feature.js";
import type { ProfileStorePort } from "../../ports/profile-store.js";
import { profileDeterministicRules } from "./profile-deterministic-rules.js";
import {
  explainProfileFact,
  forgetProfileFact,
  lookupProfileFact,
  setProfileFact,
  showProfile,
} from "./profile-operations.js";
import { privateProfileResult } from "./profile-response.js";

const fieldParameter = { required: true, type: "string" } as const;
const valueParameter = { required: true, type: "string" } as const;
const profileSetParameters = {
  field: fieldParameter,
  value: valueParameter,
} as const satisfies FeatureCapabilityParameters;
const profileLookupParameters = {
  field: fieldParameter,
} as const satisfies FeatureCapabilityParameters;
const profileShowParameters = {
  field: { type: "string" },
} as const satisfies FeatureCapabilityParameters;
const profileExplainParameters = profileShowParameters;
const profileForgetParameters = {
  field: fieldParameter,
  value: { type: "string" },
} as const satisfies FeatureCapabilityParameters;
const profileClearParameters =
  {} as const satisfies FeatureCapabilityParameters;

export function createProfileFeature(store: ProfileStorePort) {
  return defineDeterministicFeatureRules(
    defineFeature({
      id: "profile",
      displayName: "Personal Profile",
      spokenSummary: "remember explicit personal details and preferences",
      capabilities: {
        "profile.set": defineCapability({
          description:
            "Explicitly save or update one user-authored profile fact. The field must be preferredName, birthDate, pronouns, homeTimeZone, homeLocation, interest, or responseStyle.",
          parameters: profileSetParameters,
          risk: "low",
          summary: "Remember an explicit personal detail or preference.",
          execute: (request, context) =>
            setProfileFact(store, request.args, context),
        }),
        "profile.lookup": defineCapability({
          description:
            "Read exactly one explicitly stored personal profile fact needed to resolve the current request. The field must be preferredName, birthDate, pronouns, homeTimeZone, homeLocation, interest, or responseStyle. Never use this tool to retrieve the complete profile.",
          parameters: profileLookupParameters,
          risk: "low",
          summary: "Read one explicitly stored personal profile detail.",
          toolChain: "read",
          toolOnly: true,
          execute: (request) => lookupProfileFact(store, request.args),
        }),
        "profile.show": defineCapability({
          description:
            "Show a concise complete profile summary, or one field selected as preferredName, birthDate, age, pronouns, homeTimeZone, homeLocation, interest, or responseStyle.",
          parameters: profileShowParameters,
          risk: "low",
          summary: "Show explicitly remembered profile details.",
          execute: (request, context) =>
            showProfile(store, request.args, context),
        }),
        "profile.explain": defineCapability({
          description:
            "Explain why one profile fact is known using its user-authored provenance.",
          parameters: profileExplainParameters,
          risk: "low",
          summary: "Explain why a personal detail is remembered.",
          execute: (request) => explainProfileFact(store, request.args),
        }),
        "profile.forget": defineCapability({
          description:
            "Forget one explicitly selected profile fact. The field must be preferredName, birthDate, pronouns, homeTimeZone, homeLocation, interest, or responseStyle.",
          parameters: profileForgetParameters,
          risk: "low",
          summary: "Forget one personal detail or preference.",
          execute: (request) => forgetProfileFact(store, request.args),
        }),
        "profile.clear": defineCapability({
          confirmation: () => ({
            facts: { scope: "complete personal profile" },
            text: "Clear your complete personal profile?",
          }),
          description: "Permanently clear every stored personal profile fact.",
          parameters: profileClearParameters,
          requiresConfirmation: true,
          risk: "high",
          summary: "Clear the complete personal profile after confirmation.",
          execute: async () => {
            await store.clear();
            return privateProfileResult("I’ve cleared your personal profile.");
          },
        }),
      },
    }),
    profileDeterministicRules,
  );
}
