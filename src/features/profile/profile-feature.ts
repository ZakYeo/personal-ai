import {
  calculateAge,
  isProfileField,
  normalizeProfileValue,
} from "../../application/profile-policy.js";
import { defineCapability, defineFeature } from "../../application/feature.js";
import { defineDeterministicFeatureRules } from "../../application/deterministic-feature-rules.js";
import type {
  FeatureArgsFromParameters,
  FeatureCapabilityParameters,
  FeatureExecutionContext,
  FeatureResult,
} from "../../ports/feature.js";
import type {
  ProfileFact,
  ProfileField,
  ProfileStorePort,
} from "../../ports/profile-store.js";

const fieldParameter = { required: true, type: "string" } as const;
const valueParameter = { required: true, type: "string" } as const;
const profileSetParameters = {
  field: fieldParameter,
  value: valueParameter,
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

type ProfileSetArgs = FeatureArgsFromParameters<typeof profileSetParameters>;
type ProfileShowArgs = FeatureArgsFromParameters<typeof profileShowParameters>;
type ProfileExplainArgs = FeatureArgsFromParameters<
  typeof profileExplainParameters
>;
type ProfileForgetArgs = FeatureArgsFromParameters<
  typeof profileForgetParameters
>;

const deterministicRules = [
  {
    capability: "profile.set",
    match: (text: string, originalText?: string) =>
      matchProfileSet(originalText ?? text),
  },
  {
    capability: "profile.show",
    match: (text: string) => matchProfileShow(text),
  },
  {
    capability: "profile.explain",
    match: (text: string) => matchProfileExplain(text),
  },
  {
    capability: "profile.forget",
    match: (text: string) => matchProfileForget(text),
  },
  {
    capability: "profile.clear",
    match: (text: string) =>
      /^(?:clear|delete|forget) (?:my |the )?(?:complete |entire )?(?:personal )?profile$/u.test(
        text,
      )
        ? {}
        : undefined,
  },
] as const;

export function createProfileFeature(store: ProfileStorePort) {
  return defineDeterministicFeatureRules(
    defineFeature({
      id: "profile",
      displayName: "Personal Profile",
      spokenSummary: "remember explicit personal details and preferences",
      capabilities: {
        "profile.set": defineCapability({
          description:
            "Explicitly save or update one supported user-authored profile fact.",
          parameters: profileSetParameters,
          risk: "low",
          summary: "Remember an explicit personal detail or preference.",
          execute: (request, context) =>
            setProfileFact(store, request.args, context),
        }),
        "profile.show": defineCapability({
          description:
            "Show one explicitly stored profile field or a concise complete profile summary.",
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
          description: "Forget one explicitly selected profile fact.",
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
            return privateResult("I’ve cleared your personal profile.");
          },
        }),
      },
    }),
    deterministicRules,
  );
}

async function setProfileFact(
  store: ProfileStorePort,
  args: ProfileSetArgs,
  context: FeatureExecutionContext,
): Promise<FeatureResult> {
  const field = requireProfileField(args.field);
  const value = normalizeProfileValue(field, args.value, {
    now: context.clock.now(),
  });
  const fact = await store.set({ field, value });
  return privateResult(renderSetResponse(fact), { field, value });
}

async function showProfile(
  store: ProfileStorePort,
  args: ProfileShowArgs,
  context: FeatureExecutionContext,
): Promise<FeatureResult> {
  const facts = await store.list();
  if (args.field === "age") return showAge(facts, context);
  if (args.field !== undefined) {
    const field = requireProfileField(args.field);
    const selected = facts.filter((fact) => fact.field === field);
    return selected.length === 0
      ? privateResult(`I don’t have ${profileFieldPossessive(field)} stored.`)
      : privateResult(
          renderSelectedFacts(field, selected),
          selectedFactsData(selected),
        );
  }
  if (facts.length === 0) {
    return privateResult(
      "I don’t have any personal profile details stored yet.",
    );
  }
  return privateResult(renderProfileSummary(facts), selectedFactsData(facts));
}

async function explainProfileFact(
  store: ProfileStorePort,
  args: ProfileExplainArgs,
): Promise<FeatureResult> {
  if (args.field === undefined) {
    return privateResult(
      "Everything in your personal profile is stored because you explicitly asked me to remember it.",
    );
  }
  const field = requireProfileField(args.field);
  const fact = (await store.list()).find(
    (candidate) => candidate.field === field,
  );
  if (!fact)
    return privateResult(
      `I don’t have ${profileFieldPossessive(field)} stored.`,
    );
  return privateResult(
    `I know ${renderFactClause(fact)} because you explicitly asked me to remember it on ${formatProfileDate(fact.createdAt.slice(0, 10))}.`,
  );
}

async function forgetProfileFact(
  store: ProfileStorePort,
  args: ProfileForgetArgs,
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
    ? privateResult(renderForgottenResponse(removed))
    : privateResult(`I didn’t have ${profileFieldPossessive(field)} stored.`);
}

function showAge(
  facts: ProfileFact[],
  context: FeatureExecutionContext,
): FeatureResult {
  const birthDate = facts.find(({ field }) => field === "birthDate")?.value;
  if (!birthDate) return privateResult("I don’t have your birth date stored.");
  const timeZone =
    facts.find(({ field }) => field === "homeTimeZone")?.value ??
    context.config.assistant.timeZone;
  const age = calculateAge(birthDate, context.clock.now(), timeZone);
  return privateResult(`You’re ${age} years old.`, { age, birthDate });
}

function privateResult(
  text: string,
  data?: Record<string, string | number>,
): FeatureResult {
  return {
    ...(data ? { data } : {}),
    responseRewrite: "disabled",
    text,
  };
}

function requireProfileField(value: string): ProfileField {
  if (!isProfileField(value))
    throw new Error("Profile field is not supported.");
  return value;
}

function renderSetResponse(fact: ProfileFact): string {
  switch (fact.field) {
    case "preferredName":
      return `I’ll remember that your preferred name is ${fact.value}.`;
    case "birthDate":
      return `I’ll remember your birth date as ${formatProfileDate(fact.value)}.`;
    case "pronouns":
      return `I’ll remember that your pronouns are ${fact.value}.`;
    case "homeTimeZone":
      return `I’ll remember ${fact.value} as your home timezone.`;
    case "homeLocation":
      return `I’ll remember ${fact.value} as your home location.`;
    case "interest":
      return `I’ll remember that you’re interested in ${fact.value}.`;
    case "responseStyle":
      return `I’ll keep my responses ${fact.value}.`;
  }
}

function renderSelectedFacts(
  field: ProfileField,
  facts: ProfileFact[],
): string {
  if (field === "interest") {
    return `You’re interested in ${formatList(facts.map(({ value }) => value))}.`;
  }
  return `${capitalize(renderFactClause(facts[0]!))}.`;
}

function renderProfileSummary(facts: ProfileFact[]): string {
  const orderedFields: ProfileField[] = [
    "preferredName",
    "birthDate",
    "pronouns",
    "homeTimeZone",
    "homeLocation",
    "interest",
    "responseStyle",
  ];
  const clauses = orderedFields.flatMap((field) => {
    const selected = facts.filter((fact) => fact.field === field);
    return selected.length === 0
      ? []
      : field === "interest"
        ? [
            `you’re interested in ${formatList(selected.map(({ value }) => value))}`,
          ]
        : [renderFactClause(selected[0]!)];
  });
  return `I know ${formatList(clauses)}.`;
}

function renderFactClause(fact: ProfileFact): string {
  switch (fact.field) {
    case "preferredName":
      return `your preferred name is ${fact.value}`;
    case "birthDate":
      return `your birth date is ${formatProfileDate(fact.value)}`;
    case "pronouns":
      return `your pronouns are ${fact.value}`;
    case "homeTimeZone":
      return `your home timezone is ${fact.value}`;
    case "homeLocation":
      return `your home location is ${fact.value}`;
    case "interest":
      return `you’re interested in ${fact.value}`;
    case "responseStyle":
      return `you prefer ${fact.value} responses`;
  }
}

function renderForgottenResponse(fact: ProfileFact): string {
  return fact.field === "interest"
    ? `I’ve forgotten your interest in ${fact.value}.`
    : `I’ve forgotten ${profileFieldPossessive(fact.field)}.`;
}

function profileFieldPossessive(field: ProfileField): string {
  switch (field) {
    case "preferredName":
      return "your preferred name";
    case "birthDate":
      return "your birth date";
    case "pronouns":
      return "your pronouns";
    case "homeTimeZone":
      return "your home timezone";
    case "homeLocation":
      return "your home location";
    case "interest":
      return "that interest";
    case "responseStyle":
      return "your response style";
  }
}

function selectedFactsData(
  facts: readonly ProfileFact[],
): Record<string, string | number> {
  const data: Record<string, string | number> = {};
  for (const fact of facts) {
    if (fact.field === "interest") {
      const index = Object.keys(data).filter((key) =>
        key.startsWith("interest"),
      ).length;
      data[`interest${index + 1}`] = fact.value;
    } else {
      data[fact.field] = fact.value;
    }
  }
  return data;
}

function formatProfileDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function formatList(values: string[]): string {
  if (values.length < 3) {
    return new Intl.ListFormat("en-GB", {
      style: "long",
      type: "conjunction",
    }).format(values);
  }
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function matchProfileSet(
  text: string,
): { field: string; value: string } | undefined {
  const patterns: Array<[RegExp, ProfileField]> = [
    [
      /^(?:remember that |set )?my (?:preferred )?name (?:is|to) (?<value>.+)$/iu,
      "preferredName",
    ],
    [
      /^(?:remember that |set )?my (?:birth date|birthday) (?:is|to) (?<value>\d{4}-\d{2}-\d{2})$/iu,
      "birthDate",
    ],
    [
      /^(?:remember that |set )?my pronouns (?:are|to) (?<value>.+)$/iu,
      "pronouns",
    ],
    [
      /^(?:remember that |set )?my home timezone (?:is|to) (?<value>.+)$/iu,
      "homeTimeZone",
    ],
    [
      /^(?:remember that |set )?my home location (?:is|to) (?<value>.+)$/iu,
      "homeLocation",
    ],
    [
      /^(?:remember that )?i(?: am|'m) interested in (?<value>.+)$/iu,
      "interest",
    ],
    [/^(?:remember that )?i (?:like|love|enjoy) (?<value>.+)$/iu, "interest"],
    [
      /^(?:set )?my response style (?:is|to) (?<value>concise|balanced|detailed)$/iu,
      "responseStyle",
    ],
  ];
  for (const [pattern, field] of patterns) {
    const value = pattern.exec(text)?.groups?.value;
    if (value) return { field, value };
  }
  return;
}

function matchProfileShow(text: string): { field?: string } | undefined {
  if (/^what do you know about me$/u.test(text)) return {};
  const mappings: Array<[RegExp, string]> = [
    [/^(?:what(?:'s| is)|tell me) my (?:preferred )?name$/u, "preferredName"],
    [/^(?:what(?:'s| is)|tell me) my (?:birth date|birthday)$/u, "birthDate"],
    [/^(?:how old am i|what(?:'s| is) my age)$/u, "age"],
    [/^(?:what are|tell me) my pronouns$/u, "pronouns"],
    [/^(?:what(?:'s| is)|tell me) my home timezone$/u, "homeTimeZone"],
    [/^(?:what(?:'s| is)|tell me) my home location$/u, "homeLocation"],
    [/^(?:what are|tell me) my interests$/u, "interest"],
    [/^(?:what(?:'s| is)|tell me) my response style$/u, "responseStyle"],
  ];
  for (const [pattern, field] of mappings) {
    if (pattern.test(text)) return { field };
  }
  return;
}

function matchProfileExplain(text: string): { field?: string } | undefined {
  if (/^why do you know that$/u.test(text)) return {};
  const match =
    /^why do you know my (?<field>name|birth date|pronouns|home timezone|home location|interests|response style)$/u.exec(
      text,
    );
  const field = match?.groups?.field;
  if (!field) return;
  return {
    field: explainFieldAliases[field as keyof typeof explainFieldAliases],
  };
}

const explainFieldAliases = {
  "birth date": "birthDate",
  "home location": "homeLocation",
  "home timezone": "homeTimeZone",
  interests: "interest",
  name: "preferredName",
  pronouns: "pronouns",
  "response style": "responseStyle",
} as const;

function matchProfileForget(
  text: string,
): { field: string; value?: string } | undefined {
  const interest =
    /^forget (?:that )?i(?: am|'m) interested in (?<value>.+)$/u.exec(text)
      ?.groups?.value;
  if (interest) return { field: "interest", value: interest };
  const mappings: Array<[RegExp, ProfileField]> = [
    [/^forget my (?:preferred )?name$/u, "preferredName"],
    [/^forget my (?:birth date|birthday)$/u, "birthDate"],
    [/^forget my pronouns$/u, "pronouns"],
    [/^forget my home timezone$/u, "homeTimeZone"],
    [/^forget my home location$/u, "homeLocation"],
    [/^forget my response style$/u, "responseStyle"],
  ];
  for (const [pattern, field] of mappings) {
    if (pattern.test(text)) return { field };
  }
  return;
}
