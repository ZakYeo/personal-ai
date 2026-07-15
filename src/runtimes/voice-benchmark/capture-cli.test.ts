import { runVoiceCorpusCaptureCli } from "./capture-cli.js";

const phraseManifest = JSON.stringify({
  phrases: [
    {
      active: true,
      capabilities: ["alarm.list"],
      id: "alarm-list-v1",
      text: "List my alarms",
    },
  ],
  schemaVersion: 1,
});

describe("voice corpus capture CLI", () => {
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
      readBinaryFile: () => Promise.resolve(createValidWav()),
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
      writeLine: (line) => events.push(`line:${line}`),
      writeTextFile: (_path, contents) => {
        writtenIndex = contents;
        return Promise.resolve();
      },
    });

    expect(exitCode).toBe(0);
    expect(events).toContain(
      "rec:-q -r 16000 -c 1 -b 16 -e signed-integer .voice-benchmark/capture/alarm-list-v1-1.wav trim 0 8 silence 1 0.1 1% 1 1.0 1%",
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
      writeLine: (line) => lines.push(line),
      writeTextFile: () => Promise.resolve(),
    });

    expect(exitCode).toBe(1);
    expect(commandRan).toBe(false);
    expect(lines.join("\n")).toMatch(/--speaker/iu);
  });
});

function createValidWav(): Buffer {
  const samples = [
    ...Array.from({ length: 16_000 }, (_, index) =>
      index % 20 < 10 ? 2_000 : -2_000,
    ),
    ...Array.from({ length: 8_000 }, () => 0),
  ];
  const dataBytes = samples.length * 2;
  const wav = Buffer.alloc(44 + dataBytes);
  wav.write("RIFF", 0, "ascii");
  wav.writeUInt32LE(36 + dataBytes, 4);
  wav.write("WAVE", 8, "ascii");
  wav.write("fmt ", 12, "ascii");
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(16_000, 24);
  wav.writeUInt32LE(32_000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36, "ascii");
  wav.writeUInt32LE(dataBytes, 40);
  samples.forEach((sample, index) => wav.writeInt16LE(sample, 44 + index * 2));
  return wav;
}
