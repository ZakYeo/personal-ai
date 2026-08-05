import type { ProfileField } from "../../ports/profile-store.js";

export const profileDeterministicRules = [
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
