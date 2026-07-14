import type { DesktopCommandConfig } from "../../adapters/desktop/desktop-command-config.js";
import type { ProcessControl } from "../../ports/process-control.js";
import type {
  StreamingSpeechToTextPort,
  StreamingTextToSpeechPort,
} from "../../ports/voice.js";
import type { ResolvedVoiceConfig } from "../config/voice-config.js";
import type { ResolvedDesktopVoiceServiceAdapterConfig } from "./desktop-voice-adapter-types.js";
import { chunksFromText } from "../../test-support/voice-streams.js";

const tempFileMocks = vi.hoisted(() => ({
  cleanup: vi.fn(),
  createFile: vi.fn(),
  createNodeVoiceTempFiles: vi.fn(),
}));

vi.mock("./voice-temp-files.js", () => ({
  createNodeVoiceTempFiles: tempFileMocks.createNodeVoiceTempFiles,
}));

describe("desktop voice adapter registry", () => {
  beforeEach(() => {
    tempFileMocks.cleanup.mockResolvedValue(undefined);
    tempFileMocks.createFile.mockResolvedValue("/tmp/personal-ai-test.wav");
    tempFileMocks.createNodeVoiceTempFiles.mockReturnValue({
      cleanup: tempFileMocks.cleanup,
      createFile: tempFileMocks.createFile,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("creates one temp-file owner for the full desktop service adapter set", async () => {
    const { createDesktopVoiceServiceAdapters } =
      await import("./desktop-voice-adapter-registry.js");

    const adapters = createDesktopVoiceServiceAdapters(
      createVoiceConfig(),
      createDesktopVoiceServiceConfig(),
      {
        env: {},
        fetch: vi.fn() as typeof fetch,
        processControl: createProcessControl(),
      },
    );

    expect(tempFileMocks.createNodeVoiceTempFiles).toHaveBeenCalledTimes(1);

    await adapters.cleanup?.();

    expect(tempFileMocks.cleanup).toHaveBeenCalledTimes(1);
  });

  it("composes alarm delivery without input, wake, or transcription adapters", async () => {
    const { createDesktopVoiceOutputAdapters } =
      await import("./desktop-voice-adapter-registry.js");

    const adapters = createDesktopVoiceOutputAdapters(
      createVoiceConfig(),
      createDesktopVoiceServiceConfig(),
      {
        env: {},
        fetch: vi.fn() as typeof fetch,
        processControl: createProcessControl(),
      },
    );

    expect(Object.keys(adapters).sort()).toEqual([
      "audioOutput",
      "cleanup",
      "textToSpeech",
    ]);
  });

  it("creates streaming adapters as cohesive input and output paths", async () => {
    const { createDesktopVoiceServiceAdapters } =
      await import("./desktop-voice-adapter-registry.js");
    const streamingSpeechToText: StreamingSpeechToTextPort = {
      transcribeStream: () => Promise.resolve({ text: "done" }),
    };
    const streamingTextToSpeech: StreamingTextToSpeechPort = {
      synthesizeStream: () =>
        Promise.resolve({
          chunks: chunksFromText("done"),
          text: "done",
        }),
    };

    const adapters = createDesktopVoiceServiceAdapters(
      {
        ...createVoiceConfig(),
        streamingAudioInput: "sox-rec-stream",
        streamingAudioOutput: "sox-play-stream",
        streamingSpeechToText: "test-streaming-stt",
        streamingTextToSpeech: "test-streaming-tts",
      },
      {
        ...createDesktopVoiceServiceConfig(),
        streamingSpeechToText: {
          audioInput: createVoiceCommand("fake-stream-rec"),
          transcription: { create: () => streamingSpeechToText },
        },
        streamingTextToSpeech: {
          audioOutput: createVoiceCommand("fake-stream-play"),
          speech: { create: () => streamingTextToSpeech },
        },
      },
      {
        env: {},
        fetch: vi.fn() as typeof fetch,
        processControl: createProcessControl(),
      },
    );

    expect(typeof adapters.streamingInput?.audioInput.captureStream).toBe(
      "function",
    );
    expect(adapters.streamingInput?.speechToText).toBe(streamingSpeechToText);
    expect(typeof adapters.streamingOutput?.audioOutput.playStream).toBe(
      "function",
    );
    expect(adapters.streamingOutput?.textToSpeech).toBe(streamingTextToSpeech);
  });
});

function createVoiceConfig(): ResolvedVoiceConfig {
  return {
    audioOutput: "sox-play",
    input: "sox-rec",
    speechToText: "command",
    textToSpeech: "command",
    wakeWord: "text-prefix",
  };
}

function createDesktopVoiceServiceConfig(): ResolvedDesktopVoiceServiceAdapterConfig {
  return {
    audioInput: createVoiceCommand("fake-rec"),
    audioOutput: createVoiceCommand("fake-play"),
    speechToText: createVoiceCommand("fake-stt"),
    textToSpeech: createVoiceCommand("fake-tts"),
    wakeAudioInput: createVoiceCommand("fake-wake-rec"),
  };
}

function createVoiceCommand(command: string): DesktopCommandConfig {
  return { command };
}

function createProcessControl(): ProcessControl {
  return {
    kill: vi.fn(),
    platform: "linux",
  };
}
