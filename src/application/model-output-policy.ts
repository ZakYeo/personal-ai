export const modelOutputLimits = Object.freeze({
  responseCharacters: 16_000,
  summaryCharacters: 2_000,
});

export function assertConversationSummaryWithinLimit(
  summary: unknown,
): asserts summary is string {
  if (typeof summary !== "string" || summary.trim().length === 0) {
    throw new Error("Conversation summary must be a non-empty string.");
  }

  if (summary.length > modelOutputLimits.summaryCharacters) {
    throw new Error("Conversation summary exceeded the application limit.");
  }
}
