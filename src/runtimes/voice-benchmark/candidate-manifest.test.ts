import { readFile } from "node:fs/promises";
import { parseCandidateManifest } from "./candidate-manifest.js";

describe("voice benchmark candidate manifest", () => {
  it("locks the committed desktop candidate matrix", async () => {
    const manifest = parseCandidateManifest(
      JSON.parse(
        await readFile("benchmarks/voice/candidates.json", "utf8"),
      ) as unknown,
    );

    expect(manifest.candidates.map(({ id }) => id)).toEqual([
      "whisper-base-en",
      "whisper-small-en",
      "sherpa-zipformer-en-20m-int8",
      "piper-alba-medium",
      "sherpa-amy-low",
    ]);
  });

  it("rejects duplicate IDs, unknown engines, and unsafe install paths", () => {
    const candidate = createCandidate();
    expect(() =>
      parseCandidateManifest({
        candidates: [candidate, candidate],
        schemaVersion: 1,
      }),
    ).toThrow(/duplicate/iu);
    expect(() =>
      parseCandidateManifest({
        candidates: [{ ...candidate, engine: "cloud" }],
        schemaVersion: 1,
      }),
    ).toThrow(/engine/iu);
    expect(() =>
      parseCandidateManifest({
        candidates: [{ ...candidate, installDirectory: "../escape" }],
        schemaVersion: 1,
      }),
    ).toThrow(/installDirectory/iu);
  });
});

function createCandidate() {
  return {
    artifactIds: ["whisper-engine-source", "whisper-base-en-model"],
    desktopDriver: {
      args: ["-f", "{input}"],
      command: ".voice-benchmark/bin/whisper",
      environment: {},
      transcriptFormat: "plain",
    },
    engine: "whisper.cpp",
    executable: "build/bin/whisper-cli",
    id: "whisper-base-en",
    installDirectory: "whisper.cpp-v1.8.6-x64",
    modelFiles: ["ggml-base.en.bin"],
    operation: "stt",
    revision: "v1.8.6",
  };
}
