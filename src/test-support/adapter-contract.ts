import type { VoiceCommandConfig } from "../ports/assistant.js";
import type {
  CapturedAudio,
  SpeechTranscript,
  SynthesizedSpeech,
} from "../ports/voice.js";

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set(
    "content-type",
    headers.get("content-type") ?? "application/json",
  );

  return new Response(JSON.stringify(body), {
    headers,
    status: init.status ?? 200,
    ...(init.statusText ? { statusText: init.statusText } : {}),
  });
}

export function providerErrorResponse(
  status: number,
  body: unknown,
  statusText = "Provider Error",
): Response {
  return jsonResponse(body, { status, statusText });
}

export function createFetchStub(response: Response): typeof fetch {
  return vi.fn().mockResolvedValue(response);
}

export function createAbortingFetchStub(): typeof fetch {
  return vi.fn((_url: string | URL | Request, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("aborted", "AbortError"));
      });
    });
  });
}

export function createShellCommand(
  script: string,
  ...args: string[]
): VoiceCommandConfig {
  return {
    args: ["-c", script, "sh", ...args],
    command: "/bin/sh",
  };
}

export function createSuccessfulCommandScript(
  stdout: string,
  stderr = "",
): string {
  return [
    stdout ? `printf '%s' ${JSON.stringify(stdout)}` : "",
    stderr ? `printf '%s' ${JSON.stringify(stderr)} >&2` : "",
  ]
    .filter(Boolean)
    .join("; ");
}

export function createFailingCommandScript(
  stderr: string,
  exitCode: number,
): string {
  return `printf '%s' ${JSON.stringify(stderr)} >&2; exit ${exitCode}`;
}

export const voiceAdapterContractFixtures = {
  audio: {
    filePath: "/tmp/audio.wav",
    text: "Hey Jarvis, list my alarms",
  } satisfies CapturedAudio,
  speech: {
    filePath: "/tmp/speech.wav",
    text: "Alarm set.",
  } satisfies SynthesizedSpeech,
  transcription: {
    text: "Hey Jarvis, list my alarms",
  } satisfies SpeechTranscript,
};
