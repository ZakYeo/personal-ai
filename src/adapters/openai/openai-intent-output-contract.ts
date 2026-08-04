import type { IntentInterpretation } from "../../ports/intent.js";

export type OpenAIIntentOutputKind = Exclude<
  IntentInterpretation["kind"],
  "tool_call"
>;

export type OpenAIIntentOutputField =
  | "kind"
  | "command"
  | "plan"
  | "clarificationCapability"
  | "response";

interface OpenAIIntentOutputVariantContract {
  readonly availability: "always" | "capability_catalog";
  readonly fields: readonly OpenAIIntentOutputField[];
  readonly instruction: string;
}

export const openAIIntentOutputContract = {
  command: {
    availability: "always",
    fields: ["kind", "command"],
    instruction:
      "Use kind command with the exact enabled capability name, a parameters array, and the user's original text when one capability matches.",
  },
  plan: {
    availability: "always",
    fields: ["kind", "plan"],
    instruction:
      "Use kind plan with one to three fully resolved commands when the user requests multiple enabled capabilities in one utterance.",
  },
  conversation: {
    availability: "always",
    fields: ["kind"],
    instruction: "Use kind conversation for general questions or casual chat.",
  },
  clarification: {
    availability: "capability_catalog",
    fields: ["kind", "clarificationCapability", "response"],
    instruction:
      "Use kind clarification with an ok response and clarificationCapability set to the exact enabled capability only when a specific workflow is selected and one user answer is required to resolve it.",
  },
  rephrase: {
    availability: "always",
    fields: ["kind", "response"],
    instruction:
      "Use kind rephrase with an ok response when the request is too incomplete to select a specific workflow; ask one concise open question.",
  },
  replacement: {
    availability: "always",
    fields: ["kind"],
    instruction:
      "Use kind replacement only for a changed-topic clarification reply when the continuation rules require it.",
  },
  unknown: {
    availability: "always",
    fields: ["kind", "response"],
    instruction:
      "Use kind unknown with a response only when the user intent is unclear.",
  },
  unsupported: {
    availability: "always",
    fields: ["kind", "response"],
    instruction:
      "Use kind unsupported with a response for command-like requests that no enabled capability can handle.",
  },
} as const satisfies Record<
  OpenAIIntentOutputKind,
  OpenAIIntentOutputVariantContract
>;

export function getOpenAIIntentOutputContract(
  kind: OpenAIIntentOutputKind,
): OpenAIIntentOutputVariantContract {
  return openAIIntentOutputContract[kind];
}

export function isOpenAIIntentOutputKind(
  kind: unknown,
): kind is OpenAIIntentOutputKind {
  if (
    typeof kind !== "string" ||
    !Object.hasOwn(openAIIntentOutputContract, kind)
  ) {
    return false;
  }
  return true;
}

export function listOpenAIIntentOutputVariants(
  hasCapabilities: boolean,
): ReadonlyArray<
  readonly [OpenAIIntentOutputKind, OpenAIIntentOutputVariantContract]
> {
  return (
    Object.entries(openAIIntentOutputContract) as Array<
      [OpenAIIntentOutputKind, OpenAIIntentOutputVariantContract]
    >
  ).filter(
    ([, variant]) =>
      hasCapabilities || variant.availability !== "capability_catalog",
  );
}

export function createOpenAIIntentVariantInstructions(
  hasCapabilities: boolean,
): string[] {
  return listOpenAIIntentOutputVariants(hasCapabilities).map(
    ([, variant]) => variant.instruction,
  );
}
