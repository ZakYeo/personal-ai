import { stripWakePhrase } from "../../application/spoken-text.js";
import type { PresentationInteraction } from "../presentation/presentation-interaction-coordinator.js";
import type { VoiceOutputCoordinator } from "./voice-output-coordinator.js";
import type { VoiceTurnInstrumentation } from "./voice-timings.js";

export function isVoiceStopCommand(
  text: string,
  wakePhrases: string[],
): boolean {
  const command = stripWakePhrase(text, wakePhrases);
  return command === "stop" || command === "stop please";
}

export async function stopVoiceOutputForCommand(options: {
  text: string;
  wakePhrases: string[];
  outputCoordinator?: VoiceOutputCoordinator;
  instrumentation: VoiceTurnInstrumentation;
  presentation: PresentationInteraction;
}): Promise<boolean> {
  if (!isVoiceStopCommand(options.text, options.wakePhrases)) return false;
  options.instrumentation.mark("stop_recognized");
  await options.outputCoordinator?.interrupt();
  options.instrumentation.mark("output_stopped");
  options.presentation.interrupted();
  return true;
}
