import {
  createCaptureAudioCommands,
  parseCaptureArguments,
  runVoiceCorpusCaptureCli,
  selectCaptureAudioProfile,
} from "./capture-cli.js";
import { createVoiceBenchmarkWav } from "../../test-support/voice-benchmark.js";

const phraseManifest = JSON.stringify({
  phrases: [
    {
      active: true,
      capabilities: ["alarm.list"],
      captureTier: "core",
      id: "alarm-list-v1",
      text: "List my alarms",
    },
  ],
  schemaVersion: 1,
});

describe("voice corpus capture CLI", () => {
  it("defaults to core capture and accepts an explicit all-phrases scope", () => {
    expect(parseCaptureArguments(["--speaker", "primary"])).toEqual({
      scope: "core",
      speakerId: "primary",
    });
    expect(parseCaptureArguments(["--speaker", "primary", "--all"])).toEqual({
      scope: "all",
      speakerId: "primary",
    });
    expect(parseCaptureArguments(["--speaker", "primary", "--unknown"])).toBe(
      undefined,
    );
  });

  it("targets the explicit WSLg PulseAudio device for recording and playback", () => {
    expect(
      createCaptureAudioCommands(
        "/tmp/take.wav",
        selectCaptureAudioProfile("unix:/mnt/wslg/PulseServer"),
      ),
    ).toEqual({
      playback: {
        args: ["-q", "/tmp/take.wav", "-t", "pulseaudio", "default"],
        command: "sox",
        timeoutMs: 20_000,
      },
      recording: {
        args: [
          "-q",
          "-t",
          "pulseaudio",
          "default",
          "-r",
          "16000",
          "-c",
          "1",
          "-b",
          "16",
          "-e",
          "signed-integer",
          "/tmp/take.wav",
          "trim",
          "0",
          "15",
          "silence",
          "-l",
          "1",
          "0.1",
          "1%",
          "1",
          "2.0",
          "1%",
        ],
        command: "sox",
        timeoutMs: 18_000,
      },
    });
    expect(selectCaptureAudioProfile(undefined)).toBeUndefined();
  });

  it("records missing phrases through SoX and persists consented metadata", async () => {
    const events: string[] = [];
    let writtenIndex = "";
    const answers = ["", "accept", "I CONSENT"];

    const exitCode = await runVoiceCorpusCaptureCli(["--speaker", "primary"], {
      copyFile: (source, destination) => {
        events.push(`copy:${source}:${destination}`);
        return Promise.resolve();
      },
      makeDirectory: (path) => {
        events.push(`mkdir:${path}`);
        return Promise.resolve();
      },
      now: () => new Date("2026-07-15T10:00:00.000Z"),
      question: () => Promise.resolve(answers.shift() ?? ""),
      readBinaryFile: () =>
        Promise.resolve(
          createVoiceBenchmarkWav([
            ...Array.from({ length: 16_000 }, (_, index) =>
              index % 20 < 10 ? 2_000 : -2_000,
            ),
            ...Array.from({ length: 8_000 }, () => 0),
          ]),
        ),
      readTextFile: (path) =>
        Promise.resolve(
          path.endsWith("personal-phrases.json")
            ? phraseManifest
            : '{"schemaVersion":1,"recordings":[]}',
        ),
      removeFile: () => Promise.resolve(),
      runCommand: ({ args, command }) => {
        events.push(`${command}:${args?.join(" ") ?? ""}`);
        return Promise.resolve();
      },
      writeDiagnostic: (error) => events.push(`diagnostic:${String(error)}`),
      writeLine: (line) => events.push(`line:${line}`),
      writeTextFile: (_path, contents) => {
        writtenIndex = contents;
        return Promise.resolve();
      },
    });

    expect(exitCode).toBe(0);
    expect(events).toContain(
      "rec:-q -r 16000 -c 1 -b 16 -e signed-integer .voice-benchmark/capture/alarm-list-v1-1.wav trim 0 15 silence -l 1 0.1 1% 1 2.0 1%",
    );
    expect(events).toContain(
      "play:-q .voice-benchmark/capture/alarm-list-v1-1.wav",
    );
    expect(JSON.parse(writtenIndex)).toMatchObject({
      recordings: [
        {
          consentedAt: "2026-07-15T10:00:00.000Z",
          filePath: "benchmarks/voice/corpus/personal/alarm-list-v1.wav",
          phraseId: "alarm-list-v1",
          speakerId: "primary",
        },
      ],
      schemaVersion: 1,
    });
  });

  it("fails safely for unknown arguments before accessing the microphone", async () => {
    let commandRan = false;
    const lines: string[] = [];

    const exitCode = await runVoiceCorpusCaptureCli(["--all"], {
      copyFile: () => Promise.resolve(),
      makeDirectory: () => Promise.resolve(),
      now: () => new Date(),
      question: () => Promise.resolve(""),
      readBinaryFile: () => Promise.resolve(Buffer.alloc(0)),
      readTextFile: () => Promise.resolve("{}"),
      removeFile: () => Promise.resolve(),
      runCommand: () => {
        commandRan = true;
        return Promise.resolve();
      },
      writeDiagnostic: (error) => lines.push(`diagnostic:${String(error)}`),
      writeLine: (line) => lines.push(line),
      writeTextFile: () => Promise.resolve(),
    });

    expect(exitCode).toBe(1);
    expect(commandRan).toBe(false);
    expect(lines.join("\n")).toMatch(/--speaker/iu);
  });

  it("turns recorder failures into safe microphone guidance", async () => {
    const diagnostics: unknown[] = [];
    const lines: string[] = [];
    const exitCode = await runVoiceCorpusCaptureCli(["--speaker", "primary"], {
      copyFile: () => Promise.resolve(),
      makeDirectory: () => Promise.resolve(),
      now: () => new Date(),
      question: () => Promise.resolve(""),
      readBinaryFile: () => Promise.resolve(Buffer.alloc(0)),
      readTextFile: (path) =>
        Promise.resolve(
          path.endsWith("personal-phrases.json")
            ? phraseManifest
            : '{"schemaVersion":1,"recordings":[]}',
        ),
      removeFile: () => Promise.resolve(),
      runCommand: () =>
        Promise.reject(new Error("raw audio device diagnostics")),
      writeDiagnostic: (error) => diagnostics.push(error),
      writeLine: (line) => lines.push(line),
      writeTextFile: () => Promise.resolve(),
    });

    expect(exitCode).toBe(1);
    expect(lines.at(-1)).toBe(
      "Voice corpus capture failed: Microphone recording failed. Check that the configured audio input is available and permitted, then try again.",
    );
    expect(lines.join("\n")).not.toContain("raw audio device diagnostics");
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toBeInstanceOf(Error);
  });
});
