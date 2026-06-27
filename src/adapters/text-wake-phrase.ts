import type { WakeWordDetection, WakeWordRequest } from "../ports/voice.js";

export function detectTextWakePhrase(
  request: WakeWordRequest,
): WakeWordDetection {
  const normalizedAudio = normalizeVoiceText(request.audio.text);
  const phrase = request.wakePhrases.find((candidate) =>
    normalizedAudio.startsWith(normalizeVoiceText(candidate)),
  );

  if (!phrase) {
    return { detected: false };
  }

  return { detected: true, phrase };
}

function normalizeVoiceText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/gu, " ");
}
