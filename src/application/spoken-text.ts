interface WakePhraseTextDetection {
  detected: boolean;
  phrase?: string;
  strippedText: string;
}

const edgePunctuationPattern = /^[,.\s!?]+|[,.\s!?]+$/gu;
const leadingPunctuationPattern = /^[,.\s!?]+/u;

export function normalizeSpokenText(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(edgePunctuationPattern, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function normalizeSpokenTextPreservingCase(text: string): string {
  return text
    .trim()
    .replace(edgePunctuationPattern, "")
    .replace(/\s+/gu, " ")
    .trim();
}

export function detectWakePhrase(
  text: string,
  wakePhrases: string[],
): WakePhraseTextDetection {
  const normalizedText = normalizeSpokenText(text);
  const phrase = findWakePhrase(normalizedText, wakePhrases);

  if (!phrase) {
    return {
      detected: false,
      strippedText: normalizedText,
    };
  }

  return {
    detected: true,
    phrase,
    strippedText: stripWakePhrase(text, wakePhrases),
  };
}

export function stripWakePhrase(
  text: string,
  wakePhrases: string[] = ["hey jarvis"],
): string {
  const normalizedText = normalizeSpokenText(text);
  const phrase = findWakePhrase(normalizedText, wakePhrases);

  if (!phrase) {
    return normalizedText;
  }

  return normalizedText
    .slice(normalizeSpokenText(phrase).length)
    .replace(leadingPunctuationPattern, "")
    .trim();
}

export function stripWakePhrasePreservingCase(
  text: string,
  wakePhrases: string[] = ["hey jarvis"],
): string {
  const originalText = normalizeSpokenTextPreservingCase(text);
  const normalizedText = originalText.toLocaleLowerCase("en");
  const phrase = findWakePhrase(normalizedText, wakePhrases);
  if (!phrase) return originalText;
  return originalText
    .slice(normalizeSpokenText(phrase).length)
    .replace(leadingPunctuationPattern, "")
    .trim();
}

function findWakePhrase(
  normalizedText: string,
  wakePhrases: readonly string[],
): string | undefined {
  return wakePhrases.find((candidate) => {
    const normalizedPhrase = normalizeSpokenText(candidate);
    if (!normalizedPhrase || !normalizedText.startsWith(normalizedPhrase))
      return false;
    const remainder = normalizedText.slice(normalizedPhrase.length);
    return remainder.length === 0 || leadingPunctuationPattern.test(remainder);
  });
}
