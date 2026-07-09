import type {
  DeterministicFeatureRule,
  FeatureArgsFromParameters,
  FeatureCapability,
  FeatureCapabilityParameters,
  FeaturePlugin,
  FeatureResult,
} from "../../ports/feature.js";
import { defineCapability, defineFeature } from "../../ports/feature.js";

const capabilityDescribeParameters = {
  name: { type: "string", required: true },
} as const satisfies FeatureCapabilityParameters;

const capabilityListParameters =
  {} as const satisfies FeatureCapabilityParameters;

type CapabilityDescribeArgs = FeatureArgsFromParameters<
  typeof capabilityDescribeParameters
>;

const capabilityInfoDeterministicRules: DeterministicFeatureRule[] = [
  {
    capability: "assistant.capabilities.list",
    match: (text) =>
      (text.includes("what can you do") ||
        text.includes("capable functionalities") ||
        text.includes("capabilities") ||
        text.includes("list your tools")) &&
      !findCapabilityName(text)
        ? {}
        : undefined,
  },
  {
    capability: "assistant.capabilities.describe",
    match: (text) => {
      const name = findCapabilityName(text);

      return name ? { name } : undefined;
    },
  },
];

export function createCapabilityInfoFeature(
  getFeatures: () => FeaturePlugin[],
): FeaturePlugin {
  return defineFeature({
    id: "assistant",
    displayName: "Assistant Capability Catalog",
    capabilities: {
      "assistant.capabilities.list": defineCapability({
        description:
          "List the assistant capabilities enabled in this runtime using the generated capability catalog.",
        risk: "low",
        summary: "List enabled assistant capabilities.",
        parameters: capabilityListParameters,
        deterministicRules: deterministicRulesFor(
          "assistant.capabilities.list",
        ),
        execute: () => listCapabilities(getFeatures()),
      }),
      "assistant.capabilities.describe": defineCapability({
        description:
          "Describe one enabled assistant capability by stable capability name.",
        risk: "low",
        summary: "Describe one enabled assistant capability.",
        parameters: capabilityDescribeParameters,
        deterministicRules: deterministicRulesFor(
          "assistant.capabilities.describe",
        ),
        execute: (request) => describeCapability(getFeatures(), request.args),
      }),
    },
  });
}

function deterministicRulesFor(capability: string) {
  return capabilityInfoDeterministicRules
    .filter((rule) => rule.capability === capability)
    .map((rule) => rule.match);
}

function listCapabilities(features: FeaturePlugin[]): FeatureResult {
  const capabilityLines = collectCapabilityEntries(features).map(
    ({ capability, feature }) =>
      `${capability.name}: ${capability.summary ?? feature.displayName}`,
  );

  if (capabilityLines.length === 0) {
    return {
      text: "No assistant capabilities are enabled.",
    };
  }

  return {
    text: `I can use these enabled capabilities: ${capabilityLines.join("; ")}`,
  };
}

function describeCapability(
  features: FeaturePlugin[],
  args: CapabilityDescribeArgs,
): FeatureResult {
  const entry = collectCapabilityEntries(features).find(
    ({ capability }) => capability.name === args.name,
  );

  if (!entry) {
    return {
      text: `I do not have an enabled capability named ${args.name}.`,
    };
  }

  const parameters = formatCapabilityParameters(entry.capability);

  return {
    text: [
      `${entry.capability.name} (${entry.feature.displayName}):`,
      entry.capability.description ??
        entry.capability.summary ??
        "No description is available.",
      `Risk: ${entry.capability.risk}.`,
      `Parameters: ${parameters}.`,
    ].join(" "),
  };
}

function collectCapabilityEntries(features: FeaturePlugin[]): Array<{
  capability: FeatureCapability;
  feature: FeaturePlugin;
}> {
  return features.flatMap((feature) =>
    feature.capabilities.map((capability) => ({
      capability,
      feature,
    })),
  );
}

function formatCapabilityParameters(capability: FeatureCapability): string {
  const parameters = capability.parameters ?? {};
  const entries = Object.entries(parameters);

  if (entries.length === 0) {
    return "none";
  }

  return entries
    .map(([name, parameter]) => {
      const constraints = [
        parameter.required ? "required" : "optional",
        parameter.minimum === undefined
          ? undefined
          : `minimum ${parameter.minimum}`,
        parameter.positive ? "positive" : undefined,
      ].filter((constraint): constraint is string => constraint !== undefined);

      return `${name}: ${parameter.type}${constraints.length > 0 ? ` (${constraints.join(", ")})` : ""}`;
    })
    .join("; ");
}

function findCapabilityName(text: string): string | undefined {
  return text.match(/\b[a-z]+(?:\.[a-z_]+)+\b/u)?.[0];
}
