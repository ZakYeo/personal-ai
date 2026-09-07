import type { AssistantCommandParameters } from "../../ports/assistant.js";

export function withinDraftParameterBudget(
  parameters: readonly Readonly<AssistantCommandParameters>[],
): boolean {
  return (
    parameters.reduce((count, value) => count + Object.keys(value).length, 0) <=
      32 &&
    parameters.reduce(
      (count, value) => count + JSON.stringify(value).length,
      0,
    ) <= 8_000
  );
}
