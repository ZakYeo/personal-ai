import type { AssistantCommand } from "../../ports/assistant.js";
import type { FeatureCapability } from "../../ports/feature.js";
import { createAppError, type AppError } from "./app-error.js";

export function validateCommandForCapability(
  command: AssistantCommand,
  capability: FeatureCapability,
): AppError | undefined {
  if (command.capability !== capability.name) {
    return createAppError({
      category: "validation",
      capability: command.capability,
      message: `Expected ${capability.name} but received ${command.capability}.`,
    });
  }

  const parameterDefinitions = capability.parameters ?? {};
  const parameters = command.parameters;

  for (const [parameterName, definition] of Object.entries(
    parameterDefinitions,
  )) {
    const value = parameters[parameterName];

    if (value === undefined || value === null) {
      if (definition.required === true) {
        return createAppError({
          category: "validation",
          capability: command.capability,
          message: `${command.capability} requires ${parameterName}.`,
        });
      }

      continue;
    }

    if (typeof value !== definition.type) {
      return createAppError({
        category: "validation",
        capability: command.capability,
        message: `${command.capability} parameter ${parameterName} must be a ${definition.type}.`,
      });
    }

    if (
      definition.type === "number" &&
      typeof value === "number" &&
      definition.positive === true &&
      value <= 0
    ) {
      return createAppError({
        category: "validation",
        capability: command.capability,
        message: `${command.capability} parameter ${parameterName} must be positive.`,
      });
    }

    if (
      definition.type === "number" &&
      typeof value === "number" &&
      definition.minimum !== undefined &&
      value < definition.minimum
    ) {
      return createAppError({
        category: "validation",
        capability: command.capability,
        message: `${command.capability} parameter ${parameterName} must be at least ${definition.minimum}.`,
      });
    }
  }

  for (const parameterName of Object.keys(parameters)) {
    if (!(parameterName in parameterDefinitions)) {
      return createAppError({
        category: "validation",
        capability: command.capability,
        message: `${command.capability} does not support ${parameterName}.`,
      });
    }
  }

  return undefined;
}
