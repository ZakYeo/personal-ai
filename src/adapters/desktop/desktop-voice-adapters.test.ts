import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { VoiceTempFilePort } from "../../ports/voice.js";
import { createShellCommand } from "../../test-support/adapter-contract.js";
import {
  CommandSpeechToText,
  CommandTextToSpeech,
  CommandWakeActivation,
  SoxAudioInput,
  SoxAudioOutput,
  TextPrefixWakeWordDetector,
} from "./desktop-voice-adapters.js";

describe("desktop voice adapters", () => {
  it("captures audio to a file with a configured command", async () => {
    const adapter = new SoxAudioInput(
      {
        ...createShellCommand('printf audio > "$1"', "{output}"),
      },
      createTestTempFiles(),
    );

    const audio = await adapter.capture();

    expect(audio.text).toBe("");
    expect(audio.filePath).toBeDefined();
    await expect(readFile(audio.filePath ?? "", "utf8")).resolves.toBe("audio");
  });

  it("transcribes captured audio with a configured command", async () => {
    const adapter = new CommandSpeechToText({
      ...createShellCommand("printf 'Hey Jarvis from %s' \"$1\"", "{input}"),
    });

    await expect(
      adapter.transcribe({
        filePath: "/tmp/audio.wav",
        text: "",
      }),
    ).resolves.toEqual({
      text: "Hey Jarvis from /tmp/audio.wav",
    });
  });

  it("detects wake phrases from transcript text", async () => {
    const adapter = new TextPrefixWakeWordDetector();

    await expect(
      adapter.detect({
        audio: { text: "  Hey   Jarvis, list alarms" },
        wakePhrases: ["hey jarvis"],
      }),
    ).resolves.toEqual({
      detected: true,
      phrase: "hey jarvis",
    });
  });

  it("waits for a wake event from a configured command", async () => {
    const adapter = new CommandWakeActivation({
      ...createShellCommand(
        `printf '%s\\n' '{"type":"wake","phrase":"hey jarvis","score":0.83}'`,
      ),
    });

    await expect(
      adapter.waitForWake({ wakePhrases: ["hey jarvis"] }),
    ).resolves.toEqual({
      phrase: "hey jarvis",
    });
  });

  it("rejects malformed wake command output", async () => {
    const adapter = new CommandWakeActivation({
      ...createShellCommand("printf '%s\\n' not-json"),
    });

    await expect(
      adapter.waitForWake({ wakePhrases: ["hey jarvis"] }),
    ).rejects.toThrow("Wake activation command emitted invalid JSON.");
  });

  it("synthesizes speech to a file with a configured command", async () => {
    const adapter = new CommandTextToSpeech(
      {
        ...createShellCommand(
          'printf \'%s\' "$1" > "$2"',
          "{text}",
          "{output}",
        ),
      },
      createTestTempFiles(),
    );

    const speech = await adapter.synthesize("Alarm set.");

    expect(speech.text).toBe("Alarm set.");
    expect(speech.filePath).toBeDefined();
    await expect(readFile(speech.filePath ?? "", "utf8")).resolves.toBe(
      "Alarm set.",
    );
  });

  it("plays synthesized audio with a configured command", async () => {
    const directory = await mkdtemp(join(tmpdir(), "personal-ai-play-"));
    const markerPath = join(directory, "played.txt");
    const adapter = new SoxAudioOutput({
      ...createShellCommand('printf \'%s\' "$1" > "$2"', "{input}", markerPath),
    });

    await adapter.play({
      filePath: "/tmp/speech.wav",
      text: "Alarm set.",
    });

    await expect(readFile(markerPath, "utf8")).resolves.toBe("/tmp/speech.wav");
  });
});

function createTestTempFiles(): VoiceTempFilePort {
  const directories: string[] = [];

  return {
    async cleanup() {
      await Promise.all(
        directories.map((directory) =>
          rm(directory, { force: true, recursive: true }),
        ),
      );
    },
    async createFile(filename) {
      const directory = await mkdtemp(
        join(tmpdir(), "personal-ai-test-voice-"),
      );
      directories.push(directory);

      return join(directory, filename);
    },
  };
}
