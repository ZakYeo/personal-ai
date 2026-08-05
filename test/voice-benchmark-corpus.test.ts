import { readFile } from "node:fs/promises";

import {
  findMissingRecordings,
  findUncoveredCapabilities,
  parseCorpusManifest,
  parseRecordingIndex,
  validateRecordingIndex,
} from "../src/runtimes/voice-benchmark/corpus-manifest.js";
import { inspectCapturedPcmWav } from "../src/runtimes/voice-benchmark/corpus-capture.js";
import { loadConfig } from "../src/runtimes/config/config.js";
import { createConfiguredFeatures } from "../src/runtimes/feature-adapter-selection.js";

describe("committed voice benchmark corpus", () => {
  it("has valid incremental manifests and covers every configured capability", async () => {
    const [manifest, recordingIndex, config] = await Promise.all([
      readJson("benchmarks/voice/corpus/personal-phrases.json").then(
        parseCorpusManifest,
      ),
      readJson("benchmarks/voice/corpus/personal-recordings.json").then(
        parseRecordingIndex,
      ),
      loadConfig(),
    ]);
    const features = createConfiguredFeatures(config, {
      runtime: {
        clock: { now: () => new Date("2026-07-15T09:00:00.000Z") },
      },
    });
    const capabilityNames = features.flatMap((feature) =>
      feature.capabilities.flatMap((capability) =>
        capability.toolOnly === true ? [] : [capability.name],
      ),
    );

    validateRecordingIndex(manifest, recordingIndex);
    expect(manifest.phrases.filter((phrase) => phrase.active)).toHaveLength(49);
    expect(
      manifest.phrases.filter(
        (phrase) => phrase.active && phrase.captureTier === "core",
      ),
    ).toHaveLength(41);
    expect(recordingIndex.schemaVersion).toBe(1);
    expect(recordingIndex.recordings).toHaveLength(22);
    expect(findUncoveredCapabilities(capabilityNames, manifest)).toEqual([]);
    expect(
      findUncoveredCapabilities(capabilityNames, manifest, "core"),
    ).toEqual([]);
    expect(
      findMissingRecordings(manifest, recordingIndex, "core").map(
        (phrase) => phrase.id,
      ),
    ).toEqual([
      "profile-set-v1",
      "profile-show-v1",
      "profile-explain-v1",
      "profile-forget-v1",
      "profile-clear-v1",
      "internet-search-current-v1",
      "internet-search-follow-up-v1",
      "weather-coat-home-v1",
      "weather-current-v1",
      "weather-forecast-v1",
      "weather-watch-create-v1",
      "weather-watch-list-v1",
      "weather-watch-cancel-v1",
      "task-list-create-v1",
      "task-list-show-v1",
      "task-list-rename-v1",
      "task-list-clear-v1",
      "task-create-v1",
      "task-complete-v1",
      "task-reopen-v1",
      "task-edit-v1",
      "task-remove-v1",
      "task-remind-v1",
      "task-reminder-acknowledge-v1",
      "calendar-reminder-v1",
    ]);

    await Promise.all(
      recordingIndex.recordings.map(async (recording) => {
        const inspection = inspectCapturedPcmWav(
          await readFile(recording.filePath),
        );
        expect(inspection).toEqual({
          bitsPerSample: recording.bitsPerSample,
          channels: recording.channels,
          sampleRate: recording.sampleRate,
          sha256: recording.sha256,
          speechEndSample: recording.speechEndSample,
        });
      }),
    );
  });
});

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}
