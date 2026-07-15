import {
  captureMissingCorpusRecordings,
  inspectCapturedPcmWav,
} from "./corpus-capture.js";
import { parseCorpusManifest, parseRecordingIndex } from "./corpus-manifest.js";
import { createVoiceBenchmarkWav } from "../../test-support/voice-benchmark.js";

const manifest = parseCorpusManifest({
  phrases: [
    {
      active: true,
      capabilities: ["alarm.create"],
      id: "already-recorded-v1",
      text: "Set an alarm for ten minutes",
    },
    {
      active: true,
      capabilities: ["calendar.search_events"],
      id: "new-calendar-v1",
      text: "What is next on my calendar",
    },
  ],
  schemaVersion: 1,
});

const index = parseRecordingIndex({
  recordings: [
    {
      bitsPerSample: 16,
      channels: 1,
      consentedAt: "2026-07-15T09:00:00.000Z",
      filePath: "personal/already-recorded-v1.wav",
      phraseId: "already-recorded-v1",
      phraseText: "Set an alarm for ten minutes",
      sampleRate: 16_000,
      sha256: "a".repeat(64),
      speakerId: "primary",
      speechEndSample: 20_000,
    },
  ],
  schemaVersion: 1,
});

describe("incremental personal corpus capture", () => {
  it("records only missing phrases and permits a focused rerecord", async () => {
    const events: string[] = [];
    const choices = ["rerecord", "accept"] as const;
    let choiceIndex = 0;

    const result = await captureMissingCorpusRecordings(manifest, index, {
      askForConsent: () => Promise.resolve(true),
      chooseRecording: () =>
        Promise.resolve(choices[choiceIndex++] ?? "accept"),
      inspectRecording: (filePath) => {
        events.push(`inspect:${filePath}`);
        return Promise.resolve({
          bitsPerSample: 16,
          channels: 1,
          sampleRate: 16_000,
          sha256: "b".repeat(64),
          speechEndSample: 30_000,
        });
      },
      now: () => new Date("2026-07-15T10:00:00.000Z"),
      playRecording: (filePath) => {
        events.push(`play:${filePath}`);
        return Promise.resolve();
      },
      promoteRecording: ({ phraseId, stagingPath }) => {
        events.push(`promote:${stagingPath}`);
        return Promise.resolve(`personal/${phraseId}.wav`);
      },
      recordPhrase: ({ attempt, phrase }) => {
        events.push(`record:${phrase.id}:${attempt}`);
        return Promise.resolve(`/tmp/${phrase.id}-${attempt}.wav`);
      },
      reportInvalidRecording: () => Promise.resolve(),
      speakerId: "primary",
    });

    expect(events).toEqual([
      "record:new-calendar-v1:1",
      "inspect:/tmp/new-calendar-v1-1.wav",
      "play:/tmp/new-calendar-v1-1.wav",
      "record:new-calendar-v1:2",
      "inspect:/tmp/new-calendar-v1-2.wav",
      "play:/tmp/new-calendar-v1-2.wav",
      "promote:/tmp/new-calendar-v1-2.wav",
    ]);
    expect(result.recordings.map((recording) => recording.phraseId)).toEqual([
      "already-recorded-v1",
      "new-calendar-v1",
    ]);
  });

  it("does not promote accepted staging recordings without final consent", async () => {
    let promoted = false;

    await expect(
      captureMissingCorpusRecordings(manifest, index, {
        askForConsent: () => Promise.resolve(false),
        chooseRecording: () => Promise.resolve("accept"),
        inspectRecording: () =>
          Promise.resolve({
            bitsPerSample: 16,
            channels: 1,
            sampleRate: 16_000,
            sha256: "b".repeat(64),
            speechEndSample: 20_000,
          }),
        now: () => new Date("2026-07-15T10:00:00.000Z"),
        playRecording: () => Promise.resolve(),
        promoteRecording: () => {
          promoted = true;
          return Promise.resolve("unexpected.wav");
        },
        recordPhrase: () => Promise.resolve("/tmp/staged.wav"),
        reportInvalidRecording: () => Promise.resolve(),
        speakerId: "primary",
      }),
    ).rejects.toThrow(/consent/iu);
    expect(promoted).toBe(false);
  });
});

describe("personal corpus WAV inspection", () => {
  it("accepts 16 kHz mono PCM with speech and controlled trailing silence", () => {
    const wav = createVoiceBenchmarkWav([
      ...Array.from({ length: 16_000 }, (_, index) =>
        index % 20 < 10 ? 2_000 : -2_000,
      ),
      ...Array.from({ length: 8_000 }, () => 0),
    ]);

    expect(inspectCapturedPcmWav(wav)).toMatchObject({
      bitsPerSample: 16,
      channels: 1,
      sampleRate: 16_000,
      speechEndSample: 16_000,
    });
  });

  it("rejects silence, clipping, invalid format, and bad duration", () => {
    expect(() =>
      inspectCapturedPcmWav(
        createVoiceBenchmarkWav(Array.from({ length: 16_000 }, () => 0)),
      ),
    ).toThrow(/silence/iu);
    expect(() =>
      inspectCapturedPcmWav(
        createVoiceBenchmarkWav(Array.from({ length: 16_000 }, () => 32_767)),
      ),
    ).toThrow(/clipping/iu);
    expect(() =>
      inspectCapturedPcmWav(
        createVoiceBenchmarkWav(
          Array.from({ length: 16_000 }, () => 500),
          24_000,
        ),
      ),
    ).toThrow(/16 kHz/iu);
    expect(() =>
      inspectCapturedPcmWav(
        createVoiceBenchmarkWav(Array.from({ length: 1_000 }, () => 500)),
      ),
    ).toThrow(/duration/iu);
  });
});
