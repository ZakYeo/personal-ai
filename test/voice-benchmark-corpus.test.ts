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
      dependencies: {
        clock: { now: () => new Date("2026-07-15T09:00:00.000Z") },
        env: {},
        fetch: () => Promise.reject(new Error("Unexpected benchmark fetch.")),
      },
    });
    const capabilityNames = features.flatMap((feature) =>
      feature.capabilities.map((capability) => capability.name),
    );

    validateRecordingIndex(manifest, recordingIndex);
    expect(manifest.phrases.filter((phrase) => phrase.active)).toHaveLength(24);
    expect(
      manifest.phrases.filter(
        (phrase) => phrase.active && phrase.captureTier === "core",
      ),
    ).toHaveLength(16);
    expect(recordingIndex.schemaVersion).toBe(1);
    expect(recordingIndex.recordings).toHaveLength(19);
    expect(findUncoveredCapabilities(capabilityNames, manifest)).toEqual([]);
    expect(
      findUncoveredCapabilities(capabilityNames, manifest, "core"),
    ).toEqual([]);
    expect(
      findMissingRecordings(manifest, recordingIndex, "core").map(
        (phrase) => phrase.id,
      ),
    ).toEqual([
      "confirmation-yes-v1",
      "confirmation-no-v1",
      "conversation-general-v1",
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
