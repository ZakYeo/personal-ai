export interface VoiceRuntimeIo {
  fallbackOutput?: { write(chunk: string): boolean | void };
  progressOutput?: { write(chunk: string): boolean | void };
  stderr?: { write(chunk: string): boolean | void };
}
