export const modelOutputLimits = Object.freeze({
  responseCharacters: 16_000,
  summaryCharacters: 2_000,
});

export function assertConversationSummaryWithinLimit(
  summary: string | undefined,
): void {
  if (
    summary !== undefined &&
    summary.length > modelOutputLimits.summaryCharacters
  ) {
    throw new Error("Conversation summary exceeded the application limit.");
  }
}
