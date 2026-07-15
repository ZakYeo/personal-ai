import { runVoiceArtifactVerifyCli } from "./artifact-verify-cli.js";

describe("voice benchmark artifact verification CLI", () => {
  it("fails closed on absent artifacts without a download dependency", async () => {
    const lines: string[] = [];
    const exitCode = await runVoiceArtifactVerifyCli(
      [
        "--manifest",
        "artifacts.json",
        "--cache",
        "/operator/cache",
        "--architecture",
        "x64",
      ],
      {
        inspectFile: () => Promise.resolve(undefined),
        readTextFile: () => Promise.resolve(JSON.stringify(createManifest())),
        writeLine: (line) => lines.push(line),
      },
    );

    expect(exitCode).toBe(1);
    expect(lines).toEqual([
      "MISSING model: /operator/cache/model.bin",
      "Artifact verification failed; no benchmark was run.",
    ]);
  });

  it("succeeds only when every allowlisted artifact matches", async () => {
    const lines: string[] = [];
    const exitCode = await runVoiceArtifactVerifyCli(
      [
        "--manifest",
        "artifacts.json",
        "--cache",
        "/operator/cache",
        "--architecture",
        "arm64",
      ],
      {
        inspectFile: () =>
          Promise.resolve({ sha256: "a".repeat(64), sizeBytes: 123 }),
        readTextFile: () => Promise.resolve(JSON.stringify(createManifest())),
        writeLine: (line) => lines.push(line),
      },
    );

    expect(exitCode).toBe(0);
    expect(lines).toEqual([
      "VERIFIED model: /operator/cache/model.bin",
      "All 1 benchmark artifacts verified.",
    ]);
  });

  it("prints usage without touching files when paths are incomplete", async () => {
    let reads = 0;
    const lines: string[] = [];
    const exitCode = await runVoiceArtifactVerifyCli([], {
      inspectFile: () => Promise.resolve(undefined),
      readTextFile: () => {
        reads += 1;
        return Promise.resolve("");
      },
      writeLine: (line) => lines.push(line),
    });

    expect(exitCode).toBe(1);
    expect(reads).toBe(0);
    expect(lines[0]).toMatch(/--manifest.*--cache/iu);
  });

  it("fails when the manifest has no artifacts for the selected architecture", async () => {
    const lines: string[] = [];
    const manifest = createManifest();
    manifest.artifacts[0]!.architectures = ["x64"];

    const exitCode = await runVoiceArtifactVerifyCli(
      [
        "--manifest",
        "artifacts.json",
        "--cache",
        "/operator/cache",
        "--architecture",
        "arm64",
      ],
      {
        inspectFile: () => Promise.reject(new Error("must not inspect")),
        readTextFile: () => Promise.resolve(JSON.stringify(manifest)),
        writeLine: (line) => lines.push(line),
      },
    );

    expect(exitCode).toBe(1);
    expect(lines).toEqual([
      "Artifact verification failed: no artifacts are allowlisted for arm64.",
    ]);
  });
});

function createManifest() {
  return {
    artifacts: [
      {
        architectures: ["x64", "arm64"],
        fileName: "model.bin",
        id: "model",
        kind: "model",
        license: "MIT",
        sha256: "a".repeat(64),
        sizeBytes: 123,
        sourceRevision: "commit-123",
        sourceUrl: "https://example.com/immutable/model.bin",
      },
    ],
    schemaVersion: 1,
  };
}
