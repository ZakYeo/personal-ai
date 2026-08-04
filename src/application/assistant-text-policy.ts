export const assistantTextLimits = Object.freeze({
  featureResponseCharacters: 16_000,
  requestCharacters: 16_000,
});

export function isAssistantRequestTextWithinLimit(text: string): boolean {
  return text.length <= assistantTextLimits.requestCharacters;
}
