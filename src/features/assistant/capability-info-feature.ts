import type { CapabilityCatalog } from "../../ports/capability-catalog.js";
import type {
  DeterministicFeatureRule,
  FeatureArgsFromParameters,
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
  catalog: CapabilityCatalog,
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
        execute: () => listCapabilities(catalog),
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
        execute: (request) => describeCapability(catalog, request.args),
      }),
    },
  });
}

export function createCapabilityInfoCatalogFeature(): {
  capabilities: FeaturePlugin["capabilities"];
  displayName: string;
  id: string;
} {
  return createCapabilityInfoFeature([] satisfies CapabilityCatalog);
}

function deterministicRulesFor(capability: string) {
  return capabilityInfoDeterministicRules
    .filter((rule) => rule.capability === capability)
    .map((rule) => rule.match);
}

function listCapabilities(catalog: CapabilityCatalog): FeatureResult {
  const capabilityLines = catalog.map(
    ({ capability, featureName }) =>
      `${capability.name}: ${capability.summary ?? featureName}`,
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
  catalog: CapabilityCatalog,
  args: CapabilityDescribeArgs,
): FeatureResult {
  const entry = catalog.find(({ capability }) => capability.name === args.name);

  if (!entry) {
    return {
      text: `I do not have an enabled capability named ${args.name}.`,
    };
  }

  return {
    text: [
      `${entry.capability.name} (${entry.featureName}):`,
      entry.capability.description ??
        entry.capability.summary ??
        "No description is available.",
      `Risk: ${entry.capability.risk}.`,
      `Parameters: ${entry.parameterText}.`,
    ].join(" "),
  };
}

function findCapabilityName(text: string): string | undefined {
  return text.match(/\b[a-z]+(?:\.[a-z_]+)+\b/u)?.[0];
}
