import type { AssistantCommand } from "../../ports/assistant.js";
import type {
  FeatureArguments,
  FeatureCapability,
} from "../../ports/feature.js";
import { createAppError, type AppError } from "./app-error.js";

type CommandDecodeResult =
  | { ok: true; args: FeatureArguments }
  | { ok: false; error: AppError };

export function validateCommandForCapability(
  command: AssistantCommand,
  capability: FeatureCapability,
): AppError | undefined {
  const result = decodeCommandForCapability(command, capability);

  return result.ok ? undefined : result.error;
}

export function decodeCommandForCapability(
  command: AssistantCommand,
  capability: FeatureCapability,
  options: { allowMissingRequired?: boolean } = {},
): CommandDecodeResult {
  if (command.capability !== capability.name) {
    return {
      ok: false,
      error: createAppError({
        category: "validation",
        capability: command.capability,
        message: `Expected ${capability.name} but received ${command.capability}.`,
      }),
    };
  }

  if (
    options.allowMissingRequired === true &&
    (Object.keys(command.parameters).length > 32 ||
      JSON.stringify(command.parameters).length > 8_000)
  ) {
    return {
      ok: false,
      error: createAppError({
        category: "validation",
        capability: command.capability,
        message: "Partial command exceeded the bounded draft field limit.",
      }),
    };
  }

  const parameterDefinitions = capability.parameters ?? {};
  const parameters = command.parameters;
  const args: FeatureArguments = {};

  for (const [parameterName, definition] of Object.entries(
    parameterDefinitions,
  )) {
    const value = parameters[parameterName];

    if (value === undefined || value === null) {
      if (
        definition.required === true &&
        options.allowMissingRequired !== true
      ) {
        return {
          ok: false,
          error: createAppError({
            category: "validation",
            capability: command.capability,
            message: `${command.capability} requires ${parameterName}.`,
          }),
        };
      }

      continue;
    }

    if (typeof value !== definition.type) {
      return {
        ok: false,
        error: createAppError({
          category: "validation",
          capability: command.capability,
          message: `${command.capability} parameter ${parameterName} must be a ${definition.type}.`,
        }),
      };
    }

    if (definition.type === "number" && !Number.isFinite(value)) {
      return {
        ok: false,
        error: createAppError({
          category: "validation",
          capability: command.capability,
          message: `${command.capability} parameter ${parameterName} must be finite.`,
        }),
      };
    }

    if (
      definition.type === "string" &&
      typeof value === "string" &&
      definition.allowedValues !== undefined &&
      !definition.allowedValues.includes(value)
    ) {
      return {
        ok: false,
        error: createAppError({
          category: "validation",
          capability: command.capability,
          message: `${command.capability} parameter ${parameterName} must be one of ${definition.allowedValues.join(", ")}.`,
        }),
      };
    }

    if (
      definition.type === "number" &&
      typeof value === "number" &&
      definition.positive === true &&
      value <= 0
    ) {
      return {
        ok: false,
        error: createAppError({
          category: "validation",
          capability: command.capability,
          message: `${command.capability} parameter ${parameterName} must be positive.`,
        }),
      };
    }

    if (
      definition.type === "number" &&
      typeof value === "number" &&
      definition.minimum !== undefined &&
      value < definition.minimum
    ) {
      return {
        ok: false,
        error: createAppError({
          category: "validation",
          capability: command.capability,
          message: `${command.capability} parameter ${parameterName} must be at least ${definition.minimum}.`,
        }),
      };
    }

    args[parameterName] = value;
  }

  for (const parameterName of Object.keys(parameters)) {
    if (!(parameterName in parameterDefinitions)) {
      return {
        ok: false,
        error: createAppError({
          category: "validation",
          capability: command.capability,
          message: `${command.capability} does not support ${parameterName}.`,
        }),
      };
    }
  }

  return {
    ok: true,
    args,
  };
}
