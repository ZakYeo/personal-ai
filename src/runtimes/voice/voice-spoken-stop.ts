import { stripWakePhrase } from "../../application/spoken-text.js";
import type { PresentationInteraction } from "../presentation/presentation-interaction-coordinator.js";
import type { VoiceOutputCoordinator } from "./voice-output-coordinator.js";
import type { VoiceTurnInstrumentation } from "./voice-timings.js";

export async function stopVoiceOutputForCommand(options: {
  text: string;
  wakePhrases: string[];
  outputCoordinator?: VoiceOutputCoordinator;
  instrumentation: VoiceTurnInstrumentation;
  presentation: PresentationInteraction;
}): Promise<boolean> {
  const command = stripWakePhrase(options.text, options.wakePhrases);
  if (command !== "stop" && command !== "stop please") return false;
  options.instrumentation.mark("stop_recognized");
  await options.outputCoordinator?.interrupt();
  options.instrumentation.mark("output_stopped");
  options.presentation.interrupted();
  return true;
}
