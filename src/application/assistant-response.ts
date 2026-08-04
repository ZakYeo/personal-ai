import type { AssistantResponse } from "../ports/assistant.js";

export function assistantResponseExpectsFollowUp(
  response: AssistantResponse,
): boolean {
  return response.expectsFollowUp === true;
}
