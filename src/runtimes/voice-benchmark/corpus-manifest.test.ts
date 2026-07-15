import {
  findMissingRecordings,
  findUncoveredCapabilities,
  parseCorpusManifest,
  parseRecordingIndex,
  validateRecordingIndex,
} from "./corpus-manifest.js";

const manifestInput = {
  phrases: [
    {
      active: true,
      capabilities: ["alarm.create"],
      id: "alarm-create-relative-v1",
      text: "Set a tea alarm for ten minutes",
    },
    {
      active: true,
      capabilities: ["calendar.search_events"],
      id: "calendar-upcoming-v1",
      text: "What is next on my calendar",
    },
    {
      active: false,
      capabilities: ["alarm.list"],
      id: "retired-alarm-list-v1",
      text: "Tell me my old alarms",
    },
  ],
  schemaVersion: 1,
};

const recordingInput = {
  recordings: [
    {
      bitsPerSample: 16,
      channels: 1,
      consentedAt: "2026-07-15T10:00:00.000Z",
      filePath: "personal/alarm-create-relative-v1.wav",
      phraseId: "alarm-create-relative-v1",
      phraseText: "Set a tea alarm for ten minutes",
      sampleRate: 16_000,
      sha256: "a".repeat(64),
      speakerId: "primary",
      speechEndSample: 42_000,
    },
  ],
  schemaVersion: 1,
};

describe("voice benchmark corpus manifests", () => {
  it("parses stable phrase IDs and accepted recording metadata from unknown", () => {
    expect(parseCorpusManifest(manifestInput).phrases).toHaveLength(3);
    expect(parseRecordingIndex(recordingInput).recordings[0]?.phraseId).toBe(
      "alarm-create-relative-v1",
    );
  });

  it("rejects duplicate phrase IDs and malformed external fields", () => {
    expect(() =>
      parseCorpusManifest({
        ...manifestInput,
        phrases: [manifestInput.phrases[0], manifestInput.phrases[0]],
      }),
    ).toThrow(/duplicate phrase ID/iu);
    expect(() =>
      parseRecordingIndex({
        ...recordingInput,
        recordings: [{ ...recordingInput.recordings[0], sha256: "unsafe" }],
      }),
    ).toThrow(/sha256/iu);
  });

  it("captures only active phrases without an accepted recording", () => {
    expect(
      findMissingRecordings(
        parseCorpusManifest(manifestInput),
        parseRecordingIndex(recordingInput),
      ).map((phrase) => phrase.id),
    ).toEqual(["calendar-upcoming-v1"]);
  });

  it("reports only newly uncovered capabilities", () => {
    expect(
      findUncoveredCapabilities(
        ["alarm.create", "calendar.search_events", "messaging.draft_reply"],
        parseCorpusManifest(manifestInput),
      ),
    ).toEqual(["messaging.draft_reply"]);
  });

  it("rejects reused IDs whose spoken text changed and orphan recordings", () => {
    const manifest = parseCorpusManifest(manifestInput);

    expect(() =>
      validateRecordingIndex(manifest, {
        recordings: [
          {
            ...parseRecordingIndex(recordingInput).recordings[0]!,
            phraseText: "Changed words under an existing ID",
          },
        ],
        schemaVersion: 1,
      }),
    ).toThrow(/new phrase ID/iu);
    expect(() =>
      validateRecordingIndex(manifest, {
        recordings: [
          {
            ...parseRecordingIndex(recordingInput).recordings[0]!,
            phraseId: "removed-without-history",
          },
        ],
        schemaVersion: 1,
      }),
    ).toThrow(/unknown phrase/iu);
  });
});
