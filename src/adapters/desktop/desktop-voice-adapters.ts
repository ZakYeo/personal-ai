import type { VoiceCommandConfig } from "../../ports/assistant.js";
import type {
  AudioInputPort,
  AudioOutputPort,
  CapturedAudio,
  SpeechToTextPort,
  SynthesizedSpeech,
  TextToSpeechPort,
  VoiceTempFilePort,
  WakeWordDetection,
  WakeWordPort,
  WakeWordRequest,
} from "../../ports/voice.js";
import { detectTextWakePhrase } from "../text-wake-phrase.js";
import { runCommand } from "./process-runner.js";

export class SoxAudioInput implements AudioInputPort {
  constructor(
    private readonly commandConfig: VoiceCommandConfig,
    private readonly tempFiles: VoiceTempFilePort,
  ) {}

  async capture(): Promise<CapturedAudio> {
    const filePath = await this.tempFiles.createFile("capture.wav");

    await runConfiguredCommand(this.commandConfig, {
      output: filePath,
    });

    return {
      filePath,
      text: "",
    };
  }
}

export class CommandSpeechToText implements SpeechToTextPort {
  constructor(private readonly commandConfig: VoiceCommandConfig) {}

  async transcribe(audio: CapturedAudio): Promise<{ text: string }> {
    const result = await runConfiguredCommand(this.commandConfig, {
      input: audio.filePath ?? "",
      text: audio.text,
    });

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

export class CommandTextToSpeech implements TextToSpeechPort {
  constructor(
    private readonly commandConfig: VoiceCommandConfig,
    private readonly tempFiles: VoiceTempFilePort,
  ) {}

  async synthesize(text: string): Promise<SynthesizedSpeech> {
    const filePath = await this.tempFiles.createFile("speech.wav");

    await runConfiguredCommand(this.commandConfig, {
      output: filePath,
      text,
    });

    return {
      filePath,
      text,
    };
  }
}

export class SoxAudioOutput implements AudioOutputPort {
  constructor(private readonly commandConfig: VoiceCommandConfig) {}

  async play(speech: SynthesizedSpeech): Promise<void> {
    await runConfiguredCommand(this.commandConfig, {
      input: speech.filePath ?? "",
      text: speech.text,
    });
  }
}

async function runConfiguredCommand(
  config: VoiceCommandConfig,
  replacements: Record<string, string>,
): ReturnType<typeof runCommand> {
  return runCommand({
    args: (config.args ?? []).map((argument) =>
      replaceCommandPlaceholders(argument, replacements),
    ),
    command: config.command,
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
