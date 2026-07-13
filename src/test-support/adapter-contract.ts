import type { DesktopCommandConfig } from "../adapters/desktop/desktop-command-config.js";
import type { GoogleCalendarConfig } from "../adapters/google-calendar/google-calendar-config.js";
import type {
  CapturedAudio,
  SpeechTranscript,
  SynthesizedSpeech,
} from "../ports/voice.js";
import type { RealtimeSocket } from "../adapters/openai/openai-realtime-transcription.js";

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

export function createGoogleCalendarConfig(
  overrides: Partial<GoogleCalendarConfig> = {},
): GoogleCalendarConfig {
  return {
    accessTokenEnv: "GOOGLE_CALENDAR_ACCESS_TOKEN",
    baseUrl: "https://calendar.example.test/v3",
    calendarId: "primary",
    clientIdEnv: "GOOGLE_CALENDAR_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CALENDAR_CLIENT_SECRET",
    maxResults: 10,
    refreshTokenEnv: "GOOGLE_CALENDAR_REFRESH_TOKEN",
    timeoutMs: 30_000,
    tokenUrl: "https://oauth2.googleapis.com/token",
    ...overrides,
  };
}

export function providerErrorResponse(
  status: number,
  body: unknown,
  statusText = "Provider Error",
): Response {
  return jsonResponse(body, { status, statusText });
}

export function malformedJsonResponse(
  body = "{not-json",
  init: ResponseInit = {},
): Response {
  const headers = new Headers(init.headers);
  headers.set(
    "content-type",
    headers.get("content-type") ?? "application/json",
  );

  return new Response(body, {
    headers,
    status: init.status ?? 200,
    ...(init.statusText ? { statusText: init.statusText } : {}),
  });
}

export function createFetchStub(response: Response): typeof fetch {
  return vi.fn().mockResolvedValue(response);
}

export function createProviderCredentialEnv(
  apiKeyEnv: string,
  apiKey = "test-provider-api-key",
): Record<string, string | undefined> {
  return { [apiKeyEnv]: apiKey };
}

export function createMissingProviderCredentialEnv(): Record<
  string,
  string | undefined
> {
  return {};
}

export function createProviderTransportFailureFetchStub(
  error: Error = new TypeError("provider transport failed"),
): typeof fetch {
  return vi.fn().mockRejectedValue(error);
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

export function readJsonRequestBody<TBody>(
  fetch: typeof globalThis.fetch,
): TBody {
  const init = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as
    | RequestInit
    | undefined;
  const body = init?.body;

  if (typeof body !== "string") {
    throw new TypeError("Expected JSON request body.");
  }

  return JSON.parse(body) as TBody;
}

export function createShellCommand(
  script: string,
  ...args: string[]
): DesktopCommandConfig {
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

export class TestRealtimeSocket implements RealtimeSocket {
  closed = false;
  readonly sentMessages: Array<Record<string, unknown>> = [];
  private readonly listeners: Record<string, Array<(event?: unknown) => void>> =
    {};

  constructor(
    private readonly options: {
      autoOpen?: boolean;
      closeError?: Error;
      errorOnSessionUpdate?: boolean;
      transcript?: string;
    } = {},
  ) {}

  addEventListener(type: string, listener: (event?: unknown) => void): void {
    this.listeners[type] = [...(this.listeners[type] ?? []), listener];

    if (type === "open" && this.options.autoOpen) {
      queueMicrotask(() => {
        this.emitOpen();
      });
    }
  }

  close(): void {
    this.closed = true;

    if (this.options.closeError) {
      throw this.options.closeError;
    }
  }

  removeEventListener(type: string, listener: (event?: unknown) => void): void {
    this.listeners[type] = (this.listeners[type] ?? []).filter(
      (candidate) => candidate !== listener,
    );
  }

  send(message: string): void {
    const parsed = JSON.parse(message) as Record<string, unknown>;
    this.sentMessages.push(parsed);

    if (parsed.type === "session.update" && this.options.errorOnSessionUpdate) {
      queueMicrotask(() => {
        if (this.closed) {
          return;
        }

        this.emitMessage({
          error: {
            code: "invalid_request_error",
            message: "Bad transcription session.",
            type: "invalid_request_error",
          },
          type: "error",
        });
      });
    }

    if (parsed.type === "input_audio_buffer.commit") {
      queueMicrotask(() => {
        if (this.closed || this.options.transcript === undefined) {
          return;
        }

        this.emitMessage({
          delta: this.options.transcript,
          type: "conversation.item.input_audio_transcription.delta",
        });
        this.emitMessage({
          transcript: this.options.transcript,
          type: "conversation.item.input_audio_transcription.completed",
        });
      });
    }
  }

  emitOpen(): void {
    this.emit("open");
  }

  emitMessage(message: Record<string, unknown>): void {
    this.emit("message", { data: JSON.stringify(message) });
  }

  emitRawMessage(message: unknown): void {
    this.emit("message", message);
  }

  emitError(error?: unknown): void {
    this.emit("error", error);
  }

  emitClose(event?: unknown): void {
    this.emit("close", event);
  }

  listenerCount(): number {
    return Object.values(this.listeners).reduce(
      (count, listeners) => count + listeners.length,
      0,
    );
  }

  async waitForSentType(type: string): Promise<void> {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (this.sentMessages.some((message) => message.type === type)) {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    throw new Error(`Timed out waiting for sent message ${type}.`);
  }

  private emit(type: string, event?: unknown): void {
    for (const listener of this.listeners[type] ?? []) {
      listener(event);
    }
  }
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
