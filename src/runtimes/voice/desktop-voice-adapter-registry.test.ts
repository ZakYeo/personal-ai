import type { VoiceCommandConfig } from "../../ports/assistant.js";
import type { ProcessControl } from "../../ports/process-control.js";
import type { ResolvedVoiceConfig } from "../config/voice-config.js";
import type { ResolvedDesktopVoiceServiceAdapterConfig } from "./desktop-voice-adapter-types.js";

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

function createVoiceCommand(command: string): VoiceCommandConfig {
  return { command };
}

function createProcessControl(): ProcessControl {
  return {
    kill: vi.fn(),
    platform: "linux",
  };
}
