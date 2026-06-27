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

export function detectWakePhrase(
  text: string,
  wakePhrases: string[],
): WakePhraseTextDetection {
  const normalizedText = normalizeSpokenText(text);
  const phrase = wakePhrases.find((candidate) =>
    normalizedText.startsWith(normalizeSpokenText(candidate)),
  );

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
  const phrase = wakePhrases.find((candidate) =>
    normalizedText.startsWith(normalizeSpokenText(candidate)),
  );

  if (!phrase) {
    return normalizedText;
  }

  return normalizedText
    .slice(normalizeSpokenText(phrase).length)
    .replace(leadingPunctuationPattern, "")
    .trim();
}
