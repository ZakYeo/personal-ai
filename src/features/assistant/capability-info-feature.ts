import type { CapabilityCatalog } from "../../ports/capability-catalog.js";
import type {
  FeatureArgsFromParameters,
  FeatureCapabilityParameters,
  FeaturePlugin,
  FeatureResult,
} from "../../ports/feature.js";
import {
  defineDeterministicFeatureRules,
  type DeterministicFeatureRule,
} from "../../ports/deterministic-feature-rules.js";
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
  return defineDeterministicFeatureRules(
    defineFeature({
      id: "assistant",
      displayName: "Assistant Capability Catalog",
      capabilities: {
        "assistant.capabilities.list": defineCapability({
          description:
            "List the assistant capabilities enabled in this runtime using the generated capability catalog.",
          risk: "low",
          summary: "List enabled assistant capabilities.",
          parameters: capabilityListParameters,
          execute: () => listCapabilities(catalog),
        }),
        "assistant.capabilities.describe": defineCapability({
          description:
            "Describe one enabled assistant capability by stable capability name.",
          risk: "low",
          summary: "Describe one enabled assistant capability.",
          parameters: capabilityDescribeParameters,
          execute: (request) => describeCapability(catalog, request.args),
        }),
      },
    }),
    capabilityInfoDeterministicRules,
  );
}

export function createCapabilityInfoCatalogFeature(): {
  capabilities: FeaturePlugin["capabilities"];
  displayName: string;
  id: string;
} {
  return createCapabilityInfoFeature([] satisfies CapabilityCatalog);
}

function listCapabilities(catalog: CapabilityCatalog): FeatureResult {
  const spokenCapabilities = formatSpokenCapabilities(catalog);

  if (spokenCapabilities.length === 0) {
    return {
      text: "No assistant capabilities are enabled.",
    };
  }

  const confirmationText = catalog.some(
    ({ capability, featureId }) =>
      featureId !== "assistant" &&
      (capability.requiresConfirmation === true || capability.risk === "high"),
  )
    ? " I will ask before high-risk actions."
    : "";

  return {
    text: `I can ${formatSpokenList(spokenCapabilities)}.${confirmationText}`,
  };
}

function formatSpokenCapabilities(catalog: CapabilityCatalog): string[] {
  const capabilities = catalog
    .filter(({ featureId }) => featureId !== "assistant")
    .map(({ capability, featureName }) =>
      formatFallbackCapability(
        capability.spokenSummary ?? capability.summary ?? featureName,
      ),
    );

  return [...new Set(capabilities)];
}

function formatFallbackCapability(text: string): string {
  return text
    .replace(/\.$/u, "")
    .replace(/^([A-Z])/u, (letter) => letter.toLowerCase());
}

function formatSpokenList(items: string[]): string {
  if (items.length === 1) {
    return items[0] ?? "";
  }

  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }

  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
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
