import {
  captureMissingCorpusRecordings,
  inspectCapturedPcmWav,
} from "./corpus-capture.js";
import {
  parseCorpusManifest,
  parseRecordingIndex,
  type RecordingIndex,
} from "./corpus-manifest.js";
import { createVoiceBenchmarkWav } from "../../test-support/voice-benchmark.js";

const manifest = parseCorpusManifest({
  phrases: [
    {
      active: true,
      capabilities: ["alarm.create"],
      captureTier: "core",
      id: "already-recorded-v1",
      text: "Set an alarm for ten minutes",
    },
    {
      active: true,
      capabilities: ["calendar.search_events"],
      captureTier: "core",
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
      saveRecordingIndex: (updatedIndex) => {
        events.push(
          `save:${updatedIndex.recordings.map((recording) => recording.phraseId).join(",")}`,
        );
        return Promise.resolve();
      },
      scope: "all",
      speakerId: "primary",
      startRecording: () => Promise.resolve("record"),
    });

    expect(events).toEqual([
      "record:new-calendar-v1:1",
      "inspect:/tmp/new-calendar-v1-1.wav",
      "play:/tmp/new-calendar-v1-1.wav",
      "record:new-calendar-v1:2",
      "inspect:/tmp/new-calendar-v1-2.wav",
      "play:/tmp/new-calendar-v1-2.wav",
      "promote:/tmp/new-calendar-v1-2.wav",
      "save:already-recorded-v1,new-calendar-v1",
    ]);
    expect(result).toMatchObject({ status: "completed" });
    expect(
      result.index.recordings.map((recording) => recording.phraseId),
    ).toEqual(["already-recorded-v1", "new-calendar-v1"]);
  });

  it("pauses before recording when session consent is declined", async () => {
    let promoted = false;

    const result = await captureMissingCorpusRecordings(manifest, index, {
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
      saveRecordingIndex: () => Promise.resolve(),
      scope: "all",
      speakerId: "primary",
      startRecording: () => Promise.resolve("record"),
    });

    expect(result).toEqual({ index, status: "paused" });
    expect(promoted).toBe(false);
  });

  it("checkpoints an accepted take before a later quit", async () => {
    let starts = 0;
    const saved: RecordingIndex[] = [];
    const emptyIndex = parseRecordingIndex({
      recordings: [],
      schemaVersion: 1,
    });

    const result = await captureMissingCorpusRecordings(manifest, emptyIndex, {
      askForConsent: () => Promise.resolve(true),
      chooseRecording: () => Promise.resolve("accept"),
      inspectRecording: () =>
        Promise.resolve({
          bitsPerSample: 16,
          channels: 1,
          sampleRate: 16_000,
          sha256: "c".repeat(64),
          speechEndSample: 20_000,
        }),
      now: () => new Date("2026-07-15T10:00:00.000Z"),
      playRecording: () => Promise.resolve(),
      promoteRecording: ({ phraseId }) =>
        Promise.resolve(`personal/${phraseId}.wav`),
      recordPhrase: ({ phrase }) => Promise.resolve(`/tmp/${phrase.id}.wav`),
      reportInvalidRecording: () => Promise.resolve(),
      saveRecordingIndex: (updatedIndex) => {
        saved.push(updatedIndex);
        return Promise.resolve();
      },
      scope: "all",
      speakerId: "primary",
      startRecording: () => Promise.resolve(starts++ === 0 ? "record" : "quit"),
    });

    expect(saved).toHaveLength(1);
    expect(result.status).toBe("paused");
    expect(
      result.index.recordings.map((recording) => recording.phraseId),
    ).toEqual(["already-recorded-v1"]);
  });

  it("can quit after playback without promoting the current take", async () => {
    let promoted = false;
    let saved = false;

    const result = await captureMissingCorpusRecordings(manifest, index, {
      askForConsent: () => Promise.resolve(true),
      chooseRecording: () => Promise.resolve("quit"),
      inspectRecording: () =>
        Promise.resolve({
          bitsPerSample: 16,
          channels: 1,
          sampleRate: 16_000,
          sha256: "d".repeat(64),
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
      saveRecordingIndex: () => {
        saved = true;
        return Promise.resolve();
      },
      scope: "all",
      speakerId: "primary",
      startRecording: () => Promise.resolve("record"),
    });

    expect(result).toEqual({ index, status: "paused" });
    expect(promoted).toBe(false);
    expect(saved).toBe(false);
  });

  it("stops before another phrase when checkpoint persistence fails", async () => {
    let recordCount = 0;
    const emptyIndex = parseRecordingIndex({
      recordings: [],
      schemaVersion: 1,
    });

    await expect(
      captureMissingCorpusRecordings(manifest, emptyIndex, {
        askForConsent: () => Promise.resolve(true),
        chooseRecording: () => Promise.resolve("accept"),
        inspectRecording: () =>
          Promise.resolve({
            bitsPerSample: 16,
            channels: 1,
            sampleRate: 16_000,
            sha256: "e".repeat(64),
            speechEndSample: 20_000,
          }),
        now: () => new Date("2026-07-15T10:00:00.000Z"),
        playRecording: () => Promise.resolve(),
        promoteRecording: ({ phraseId }) =>
          Promise.resolve(`personal/${phraseId}.wav`),
        recordPhrase: () => {
          recordCount += 1;
          return Promise.resolve("/tmp/staged.wav");
        },
        reportInvalidRecording: () => Promise.resolve(),
        saveRecordingIndex: () => Promise.reject(new Error("disk full")),
        scope: "all",
        speakerId: "primary",
        startRecording: () => Promise.resolve("record"),
      }),
    ).rejects.toThrow(/disk full/iu);
    expect(recordCount).toBe(1);
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

  it("accepts a long utterance within the fifteen-second capture bound", () => {
    const wav = createVoiceBenchmarkWav([
      ...Array.from({ length: 12 * 16_000 }, (_, index) =>
        index % 20 < 10 ? 2_000 : -2_000,
      ),
      ...Array.from({ length: 16_000 }, () => 0),
    ]);

    expect(inspectCapturedPcmWav(wav).speechEndSample).toBe(12 * 16_000);
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
    expect(() =>
      inspectCapturedPcmWav(
        createVoiceBenchmarkWav(Array.from({ length: 16 * 16_000 }, () => 500)),
      ),
    ).toThrow(/duration/iu);
  });
});
