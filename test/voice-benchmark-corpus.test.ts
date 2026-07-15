import { readFile } from "node:fs/promises";

import {
  findUncoveredCapabilities,
  parseCorpusManifest,
  parseRecordingIndex,
} from "../src/runtimes/voice-benchmark/corpus-manifest.js";
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

    expect(manifest.phrases.filter((phrase) => phrase.active)).toHaveLength(24);
    expect(recordingIndex.schemaVersion).toBe(1);
    expect(findUncoveredCapabilities(capabilityNames, manifest)).toEqual([]);
  });
});

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}
