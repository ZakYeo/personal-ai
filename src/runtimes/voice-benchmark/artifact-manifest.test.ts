import {
  parseVoiceArtifactManifest,
  verifyVoiceArtifacts,
} from "./artifact-manifest.js";
import { readFile } from "node:fs/promises";

describe("voice benchmark artifact manifest", () => {
  it("parses the committed artifact allowlist", async () => {
    const manifest = parseVoiceArtifactManifest(
      JSON.parse(
        await readFile("benchmarks/voice/artifacts.json", "utf8"),
      ) as unknown,
    );

    expect(manifest.artifacts).toHaveLength(9);
  });

  it("parses an immutable allowlist and verifies operator-supplied files", async () => {
    const manifest = parseVoiceArtifactManifest(createManifest());
    const inspected: string[] = [];

    const result = await verifyVoiceArtifacts(manifest, "/safe/cache", "x64", {
      inspectFile: (path) => {
        inspected.push(path);
        return Promise.resolve({
          sha256: "a".repeat(64),
          sizeBytes: 123,
        });
      },
    });

    expect(inspected).toEqual(["/safe/cache/model.bin"]);
    expect(result).toEqual([
      {
        artifactId: "stt-model",
        filePath: "/safe/cache/model.bin",
        status: "verified",
      },
    ]);
  });

  it("reports missing and mismatched artifacts without downloading anything", async () => {
    const manifest = parseVoiceArtifactManifest({
      ...createManifest(),
      artifacts: [
        createManifest().artifacts[0],
        {
          ...createManifest().artifacts[0],
          fileName: "missing.bin",
          id: "missing-model",
        },
      ],
    });

    const result = await verifyVoiceArtifacts(
      manifest,
      "/safe/cache",
      "arm64",
      {
        inspectFile: (path) => {
          if (path.endsWith("missing.bin")) {
            return Promise.resolve(undefined);
          }
          return Promise.resolve({ sha256: "b".repeat(64), sizeBytes: 122 });
        },
      },
    );

    expect(result).toEqual([
      expect.objectContaining({
        artifactId: "stt-model",
        status: "checksum-mismatch",
      }),
      expect.objectContaining({
        artifactId: "missing-model",
        status: "missing",
      }),
    ]);
  });

  it("checks only artifacts allowlisted for the selected architecture", async () => {
    const manifest = parseVoiceArtifactManifest({
      ...createManifest(),
      artifacts: [{ ...createManifest().artifacts[0], architectures: ["x64"] }],
    });

    await expect(
      verifyVoiceArtifacts(manifest, "/safe/cache", "arm64", {
        inspectFile: () => Promise.reject(new Error("must not inspect")),
      }),
    ).resolves.toEqual([]);
  });

  it("rejects unsafe paths, mutable URLs, duplicate IDs, and invalid checksums", () => {
    const artifact = createManifest().artifacts[0];

    expect(() =>
      parseVoiceArtifactManifest({
        ...createManifest(),
        artifacts: [{ ...artifact, fileName: "../model.bin" }],
      }),
    ).toThrow(/fileName/iu);
    expect(() =>
      parseVoiceArtifactManifest({
        ...createManifest(),
        artifacts: [{ ...artifact, sourceUrl: "http://example.com/model" }],
      }),
    ).toThrow(/HTTPS/iu);
    expect(() =>
      parseVoiceArtifactManifest({
        ...createManifest(),
        artifacts: [artifact, { ...artifact, fileName: "other.bin" }],
      }),
    ).toThrow(/duplicate.*id/iu);
    expect(() =>
      parseVoiceArtifactManifest({
        ...createManifest(),
        artifacts: [{ ...artifact, sha256: "unknown" }],
      }),
    ).toThrow(/sha256/iu);
  });
});

function createManifest() {
  return {
    artifacts: [
      {
        architectures: ["x64", "arm64"],
        fileName: "model.bin",
        id: "stt-model",
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
