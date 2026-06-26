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

  const parameterDefinitions = capability.parameters ?? {};
  const parameters = command.parameters;
  const args: FeatureArguments = {};

  for (const [parameterName, definition] of Object.entries(
    parameterDefinitions,
  )) {
    const value = parameters[parameterName];

    if (value === undefined || value === null) {
      if (definition.required === true) {
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
