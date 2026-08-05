import {
  calculateAge,
  isProfileField,
  normalizeProfileValue,
} from "../../application/profile-policy.js";
import type {
  FeatureExecutionContext,
  FeatureResult,
} from "../../ports/feature.js";
import type {
  ProfileFact,
  ProfileField,
  ProfileStorePort,
} from "../../ports/profile-store.js";
import {
  formatProfileDate,
  lookupMissingText,
  lookupQuestion,
  privateProfileResult,
  profileFieldPossessive,
  renderFactClause,
  renderForgottenResponse,
  renderProfileSummary,
  renderSelectedFacts,
  renderSetResponse,
  selectedFactsData,
} from "./profile-response.js";

export async function lookupProfileFact(
  store: ProfileStorePort,
  args: { field: string },
): Promise<FeatureResult> {
  const field = requireProfileField(args.field);
  const selected = (await store.list()).filter((fact) => fact.field === field);
  if (selected.length === 0) {
    return {
      responseRewrite: "disabled",
      text: lookupMissingText(field),
      toolClarification: {
        prompt: `${lookupQuestion(field)} I’ll save it to your profile and then continue.`,
        replyCommand: {
          capability: "profile.set",
          fixedParameters: { field },
          replyParameter: "value",
        },
      },
      toolObservationData: { field, found: false },
    };
  }

  const value = selected.map((fact) => fact.value).join(", ");
  return {
    responseRewrite: "disabled",
    text: renderSelectedFacts(field, selected),
    toolObservationData: {
      field,
      found: true,
      provenance: "user-authored",
      value,
    },
  };
}

export async function setProfileFact(
  store: ProfileStorePort,
  args: { field: string; value: string },
  context: FeatureExecutionContext,
): Promise<FeatureResult> {
  const field = requireProfileField(args.field);
  const value = normalizeProfileValue(field, args.value, {
    now: context.clock.now(),
  });
  const fact = await store.set({ field, value });
  return privateProfileResult(renderSetResponse(fact), { field, value });
}

export async function showProfile(
  store: ProfileStorePort,
  args: { field?: string },
  context: FeatureExecutionContext,
): Promise<FeatureResult> {
  const facts = await store.list();
  if (args.field === "age") return showAge(facts, context);
  if (args.field !== undefined) {
    const field = requireProfileField(args.field);
    const selected = facts.filter((fact) => fact.field === field);
    return selected.length === 0
      ? privateProfileResult(
          `I don’t have ${profileFieldPossessive(field)} stored.`,
        )
      : privateProfileResult(
          renderSelectedFacts(field, selected),
          selectedFactsData(selected),
        );
  }
  if (facts.length === 0) {
    return privateProfileResult(
      "I don’t have any personal profile details stored yet.",
    );
  }
  return privateProfileResult(
    renderProfileSummary(facts),
    selectedFactsData(facts),
  );
}

export async function explainProfileFact(
  store: ProfileStorePort,
  args: { field?: string },
): Promise<FeatureResult> {
  if (args.field === undefined) {
    return privateProfileResult(
      "Everything in your personal profile is stored because you explicitly asked me to remember it.",
    );
  }
  const field = requireProfileField(args.field);
  const fact = (await store.list()).find(
    (candidate) => candidate.field === field,
  );
  if (!fact) {
    return privateProfileResult(
      `I don’t have ${profileFieldPossessive(field)} stored.`,
    );
  }
  return privateProfileResult(
    `I know ${renderFactClause(fact)} because you explicitly asked me to remember it on ${formatProfileDate(fact.createdAt.slice(0, 10))}.`,
  );
}

export async function forgetProfileFact(
  store: ProfileStorePort,
  args: { field: string; value?: string },
): Promise<FeatureResult> {
  const field = requireProfileField(args.field);
  if (field === "interest" && args.value === undefined) {
    throw new Error("Specify the interest to forget.");
  }
  const removed = await store.forget({
    field,
    ...(args.value === undefined ? {} : { value: args.value }),
  });
  return removed
    ? privateProfileResult(renderForgottenResponse(removed))
    : privateProfileResult(
        `I didn’t have ${profileFieldPossessive(field)} stored.`,
      );
}

function showAge(
  facts: ProfileFact[],
  context: FeatureExecutionContext,
): FeatureResult {
  const birthDate = facts.find(({ field }) => field === "birthDate")?.value;
  if (!birthDate) {
    return privateProfileResult("I don’t have your birth date stored.");
  }
  const timeZone =
    facts.find(({ field }) => field === "homeTimeZone")?.value ??
    context.config.assistant.timeZone;
  const age = calculateAge(birthDate, context.clock.now(), timeZone);
  return privateProfileResult(`You’re ${age} years old.`, { age, birthDate });
}

function requireProfileField(value: string): ProfileField {
  if (!isProfileField(value)) {
    throw new Error("Profile field is not supported.");
  }
  return value;
}
