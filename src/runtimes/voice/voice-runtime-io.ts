export interface VoiceRuntimeIo {
  fallbackOutput?: { write(chunk: string): boolean | void };
  stderr?: { write(chunk: string): boolean | void };
}
