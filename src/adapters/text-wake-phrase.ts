import type { WakeWordDetection, WakeWordRequest } from "../ports/voice.js";
import { detectWakePhrase } from "./spoken-text.js";

export function detectTextWakePhrase(
  request: WakeWordRequest,
): WakeWordDetection {
  const detection = detectWakePhrase(request.audio.text, request.wakePhrases);

  if (!detection.detected) {
    return { detected: false };
  }

  return {
    detected: true,
    ...(detection.phrase ? { phrase: detection.phrase } : {}),
  };
}
