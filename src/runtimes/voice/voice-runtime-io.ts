import type { PresentationInteractionCoordinator } from "../presentation/presentation-interaction-coordinator.js";

export interface VoiceRuntimeIo {
  fallbackOutput?: { write(chunk: string): boolean | void };
  presentation?: PresentationInteractionCoordinator;
  progressOutput?: { write(chunk: string): boolean | void };
  stderr?: { write(chunk: string): boolean | void };
}
