export const assistantTextLimits = Object.freeze({
  featureResponseCharacters: 16_000,
  requestCharacters: 16_000,
});

export function isAssistantRequestTextWithinLimit(text: string): boolean {
  return text.length <= assistantTextLimits.requestCharacters;
}

export function assertFeatureResponseTextWithinLimit(
  text: unknown,
): asserts text is string {
  if (typeof text !== "string") {
    throw new Error("Feature response text must be a string.");
  }
  if (text.length > assistantTextLimits.featureResponseCharacters) {
    throw new Error(
      `Feature response text exceeded the ${assistantTextLimits.featureResponseCharacters}-character application limit.`,
    );
  }
}
