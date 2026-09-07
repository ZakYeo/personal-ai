import { resolveVoiceOperationSignal } from "../voice-operation-signal.js";
import type {
  DesktopCommandConfig,
  DesktopTextToSpeechCommandConfig,
} from "./desktop-command-config.js";
import type {
  VoiceOperationOptions,
  AudioInputPort,
  AudioOutputPort,
  CapturedAudio,
  SpeechToTextPort,
  SynthesizedSpeech,
  TextToSpeechPort,
  VoiceTempFilePort,
  WakeActivationPort,
  WakeWordDetection,
  WakeWordPort,
  WakeWordRequest,
} from "../../ports/voice.js";
import type { ProcessControl } from "../../ports/process-control.js";
import { detectTextWakePhrase } from "../text-wake-phrase.js";
import { runCommand, runCommandUntilStdoutLine } from "./process-runner.js";
import { isRecord } from "../parsing.js";

export class SoxAudioInput implements AudioInputPort {
  constructor(
    private readonly commandConfig: DesktopCommandConfig,
    private readonly tempFiles: VoiceTempFilePort,
    private readonly processControl?: ProcessControl,
    private readonly signal?: AbortSignal,
    private readonly environment: Record<string, string | undefined> = {},
  ) {}

  async capture(options?: VoiceOperationOptions): Promise<CapturedAudio> {
    const signal = resolveVoiceOperationSignal(this.signal, options);
    const filePath = await this.tempFiles.createFile("capture.wav");

    await runConfiguredCommand(
      this.commandConfig,
      {
        output: filePath,
      },
      this.processControl,
      signal,
      this.environment,
    );

    return {
      filePath,
      text: "",
    };
  }
}

export class CommandSpeechToText implements SpeechToTextPort {
  constructor(
    private readonly commandConfig: DesktopCommandConfig,
    private readonly processControl?: ProcessControl,
    private readonly signal?: AbortSignal,
    private readonly environment: Record<string, string | undefined> = {},
  ) {}

  async transcribe(
    audio: CapturedAudio,
    options?: VoiceOperationOptions,
  ): Promise<{ text: string }> {
    const signal = resolveVoiceOperationSignal(this.signal, options);
    const result = await runConfiguredCommand(
      this.commandConfig,
      {
        input: audio.filePath ?? "",
        text: audio.text,
      },
      this.processControl,
      signal,
      this.environment,
    );

    return {
      text: result.stdout.trim(),
    };
  }
}

export class TextPrefixWakeWordDetector implements WakeWordPort {
  detect(request: WakeWordRequest): Promise<WakeWordDetection> {
    return Promise.resolve(detectTextWakePhrase(request));
  }
}

export class CommandWakeActivation implements WakeActivationPort {
  constructor(
    private readonly commandConfig: DesktopCommandConfig,
    private readonly processControl?: ProcessControl,
    private readonly signal?: AbortSignal,
    private readonly environment: Record<string, string | undefined> = {},
  ) {}

  async waitForWake(
    request: { wakePhrases: string[] },
    options?: VoiceOperationOptions,
  ): Promise<{
    phrase?: string;
  }> {
    const signal = resolveVoiceOperationSignal(this.signal, options);
    const result = await runCommandUntilStdoutLine(
      {
        ...this.commandConfig,
        ...(this.processControl ? { processControl: this.processControl } : {}),
        ...(signal ? { signal } : {}),
        environment: this.environment,
      },
      (line) => parseWakeActivationLine(line, request.wakePhrases),
    );

    return result.line.phrase ? { phrase: result.line.phrase } : {};
  }
}

export class CommandTextToSpeech implements TextToSpeechPort {
  constructor(
    private readonly commandConfig: DesktopTextToSpeechCommandConfig,
    private readonly tempFiles: VoiceTempFilePort,
    private readonly processControl?: ProcessControl,
    private readonly signal?: AbortSignal,
    private readonly environment: Record<string, string | undefined> = {},
  ) {}

  async synthesize(
    text: string,
    options?: VoiceOperationOptions,
  ): Promise<SynthesizedSpeech> {
    const signal = resolveVoiceOperationSignal(this.signal, options);
    const filePath = await this.tempFiles.createFile("speech.wav");

    await runConfiguredCommand(
      this.commandConfig,
      {
        output: filePath,
        text,
      },
      this.processControl,
      signal,
      this.environment,
    );

    return {
      filePath,
      text,
    };
  }
}

interface ParsedWakeActivationLine {
  phrase?: string;
}

function parseWakeActivationLine(
  line: string,
  wakePhrases: string[],
): ParsedWakeActivationLine | undefined {
  const parsed = parseJsonLine(line);

  if (!isRecord(parsed) || parsed.type !== "wake") {
    return undefined;
  }

  const phrase = parsed.phrase;
  if (phrase !== undefined && typeof phrase !== "string") {
    throw new Error("Wake activation command phrase must be a string.");
  }

  if (
    typeof phrase === "string" &&
    wakePhrases.length > 0 &&
    !wakePhrases.includes(phrase)
  ) {
    return undefined;
  }

  return phrase ? { phrase } : {};
}

function parseJsonLine(line: string): unknown {
  try {
    return JSON.parse(line) as unknown;
  } catch (error) {
    throw new Error("Wake activation command emitted invalid JSON.", {
      cause: error,
    });
  }
}

export class SoxAudioOutput implements AudioOutputPort {
  constructor(
    private readonly commandConfig: DesktopCommandConfig,
    private readonly processControl?: ProcessControl,
    private readonly signal?: AbortSignal,
    private readonly environment: Record<string, string | undefined> = {},
  ) {}

  async play(
    speech: SynthesizedSpeech,
    options?: VoiceOperationOptions,
  ): Promise<void> {
    const signal = resolveVoiceOperationSignal(this.signal, options);
    await runConfiguredCommand(
      this.commandConfig,
      {
        input: speech.filePath ?? "",
        text: speech.text,
      },
      this.processControl,
      signal,
      this.environment,
    );
  }
}

async function runConfiguredCommand(
  config: DesktopCommandConfig,
  replacements: Record<string, string>,
  processControl?: ProcessControl,
  signal?: AbortSignal,
  environment: Record<string, string | undefined> = {},
): ReturnType<typeof runCommand> {
  return runCommand({
    args: (config.args ?? []).map((argument) =>
      replaceCommandPlaceholders(argument, replacements),
    ),
    command: config.command,
    environment,
    ...(config.stdin === undefined
      ? {}
      : { stdin: replaceCommandPlaceholders(config.stdin, replacements) }),
    ...(processControl ? { processControl } : {}),
    ...(signal ? { signal } : {}),
    ...(config.timeoutMs ? { timeoutMs: config.timeoutMs } : {}),
  });
}

function replaceCommandPlaceholders(
  value: string,
  replacements: Record<string, string>,
): string {
  return value.replaceAll(
    /\{(input|output|text)\}/gu,
    (_match, key: string) => replacements[key] ?? "",
  );
}
