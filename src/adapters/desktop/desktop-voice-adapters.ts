import type { VoiceCommandConfig } from "../../ports/assistant.js";
import type {
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
import { detectTextWakePhrase } from "../text-wake-phrase.js";
import {
  runCommand,
  runCommandUntilStdoutLine,
  type ProcessControl,
} from "./process-runner.js";

export class SoxAudioInput implements AudioInputPort {
  constructor(
    private readonly commandConfig: VoiceCommandConfig,
    private readonly tempFiles: VoiceTempFilePort,
    private readonly processControl?: ProcessControl,
  ) {}

  async capture(): Promise<CapturedAudio> {
    const filePath = await this.tempFiles.createFile("capture.wav");

    await runConfiguredCommand(
      this.commandConfig,
      {
        output: filePath,
      },
      this.processControl,
    );

    return {
      filePath,
      text: "",
    };
  }
}

export class CommandSpeechToText implements SpeechToTextPort {
  constructor(
    private readonly commandConfig: VoiceCommandConfig,
    private readonly processControl?: ProcessControl,
  ) {}

  async transcribe(audio: CapturedAudio): Promise<{ text: string }> {
    const result = await runConfiguredCommand(
      this.commandConfig,
      {
        input: audio.filePath ?? "",
        text: audio.text,
      },
      this.processControl,
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
    private readonly commandConfig: VoiceCommandConfig,
    private readonly processControl?: ProcessControl,
  ) {}

  async waitForWake(request: { wakePhrases: string[] }): Promise<{
    phrase?: string;
  }> {
    const result = await runCommandUntilStdoutLine(
      {
        ...this.commandConfig,
        ...(this.processControl ? { processControl: this.processControl } : {}),
      },
      (line) => parseWakeActivationLine(line, request.wakePhrases),
    );

    return result.line.phrase ? { phrase: result.line.phrase } : {};
  }
}

export class CommandTextToSpeech implements TextToSpeechPort {
  constructor(
    private readonly commandConfig: VoiceCommandConfig,
    private readonly tempFiles: VoiceTempFilePort,
    private readonly processControl?: ProcessControl,
  ) {}

  async synthesize(text: string): Promise<SynthesizedSpeech> {
    const filePath = await this.tempFiles.createFile("speech.wav");

    await runConfiguredCommand(
      this.commandConfig,
      {
        output: filePath,
        text,
      },
      this.processControl,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class SoxAudioOutput implements AudioOutputPort {
  constructor(
    private readonly commandConfig: VoiceCommandConfig,
    private readonly processControl?: ProcessControl,
  ) {}

  async play(speech: SynthesizedSpeech): Promise<void> {
    await runConfiguredCommand(
      this.commandConfig,
      {
        input: speech.filePath ?? "",
        text: speech.text,
      },
      this.processControl,
    );
  }
}

async function runConfiguredCommand(
  config: VoiceCommandConfig,
  replacements: Record<string, string>,
  processControl?: ProcessControl,
): ReturnType<typeof runCommand> {
  return runCommand({
    args: (config.args ?? []).map((argument) =>
      replaceCommandPlaceholders(argument, replacements),
    ),
    command: config.command,
    ...(processControl ? { processControl } : {}),
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
