import type { FeatureResult } from "../../ports/feature.js";
import type { ProfileFact, ProfileField } from "../../ports/profile-store.js";

export function privateProfileResult(
  text: string,
  data?: Record<string, string | number>,
): FeatureResult {
  return {
    ...(data ? { data } : {}),
    responseRewrite: "disabled",
    text,
  };
}

export function renderSetResponse(fact: ProfileFact): string {
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

export function renderSelectedFacts(
  field: ProfileField,
  facts: ProfileFact[],
): string {
  if (field === "interest") {
    return `You’re interested in ${formatList(facts.map(({ value }) => value))}.`;
  }
  return `${capitalize(renderFactClause(facts[0]!))}.`;
}

export function renderProfileSummary(facts: ProfileFact[]): string {
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

export function renderFactClause(fact: ProfileFact): string {
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

export function renderForgottenResponse(fact: ProfileFact): string {
  return fact.field === "interest"
    ? `I’ve forgotten your interest in ${fact.value}.`
    : `I’ve forgotten ${profileFieldPossessive(fact.field)}.`;
}

export function profileFieldPossessive(field: ProfileField): string {
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

export function lookupMissingText(field: ProfileField): string {
  return field === "interest"
    ? "I don’t have any interests stored."
    : `I don’t have ${profileFieldPossessive(field)} stored.`;
}

export function lookupQuestion(field: ProfileField): string {
  switch (field) {
    case "preferredName":
      return "What is your preferred name?";
    case "birthDate":
      return "What is your birth date?";
    case "pronouns":
      return "What are your pronouns?";
    case "homeTimeZone":
      return "What is your home timezone?";
    case "homeLocation":
      return "What is your home location?";
    case "interest":
      return "What interest should I remember?";
    case "responseStyle":
      return "Which response style do you prefer: concise, balanced, or detailed?";
  }
}

export function selectedFactsData(
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

export function formatProfileDate(value: string): string {
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
