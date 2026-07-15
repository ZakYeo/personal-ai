import {
  parseVoiceArtifactManifest,
  verifyVoiceArtifacts,
} from "./artifact-manifest.js";

interface ArtifactVerifyCliDependencies {
  inspectFile(
    path: string,
  ): Promise<{ sha256: string; sizeBytes: number } | undefined>;
  now(): Date;
  readTextFile(path: string): Promise<string>;
  writeLine(line: string): void;
}

export async function runVoiceArtifactVerifyCli(
  args: readonly string[],
  dependencies: ArtifactVerifyCliDependencies,
): Promise<number> {
  const paths = parsePaths(args);
  if (!paths) {
    dependencies.writeLine(
      "Usage: npm run benchmark:voice:verify-artifacts -- --manifest <path> --cache <directory> --architecture <x64|arm64>",
    );
    return 1;
  }

  try {
    const manifest = parseVoiceArtifactManifest(
      parseJson(
        await dependencies.readTextFile(paths.manifestPath),
        paths.manifestPath,
      ),
    );
    const results = await verifyVoiceArtifacts(
      manifest,
      paths.cacheDirectory,
      paths.architecture,
      dependencies.now(),
      dependencies,
    );
    if (results.length === 0) {
      throw new Error(
        `no artifacts are allowlisted for ${paths.architecture}.`,
      );
    }
    for (const result of results) {
      if (result.status === "verified") {
        dependencies.writeLine(
          `VERIFIED ${result.artifactId}: ${result.filePath}`,
        );
      } else if (result.status === "missing") {
        dependencies.writeLine(
          `MISSING ${result.artifactId}: ${result.filePath}`,
        );
      } else if (result.status === "cooling-off") {
        dependencies.writeLine(
          `COOLING-OFF ${result.artifactId}: eligible ${result.eligibleAt}`,
        );
      } else {
        dependencies.writeLine(
          `MISMATCH ${result.artifactId}: ${result.filePath} (expected ${result.expectedSha256}/${result.expectedSizeBytes}, received ${result.actualSha256}/${result.actualSizeBytes})`,
        );
      }
    }

    if (results.some((result) => result.status !== "verified")) {
      dependencies.writeLine(
        "Artifact verification failed; no benchmark was run.",
      );
      return 1;
    }
    dependencies.writeLine(
      `All ${results.length} benchmark artifacts verified.`,
    );
    return 0;
  } catch (error) {
    dependencies.writeLine(
      `Artifact verification failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return 1;
  }
}

function parsePaths(args: readonly string[]):
  | {
      architecture: "arm64" | "x64";
      cacheDirectory: string;
      manifestPath: string;
    }
  | undefined {
  if (
    args.length !== 6 ||
    args[0] !== "--manifest" ||
    !args[1] ||
    args[2] !== "--cache" ||
    !args[3] ||
    args[4] !== "--architecture" ||
    (args[5] !== "arm64" && args[5] !== "x64")
  ) {
    return undefined;
  }
  return {
    architecture: args[5],
    cacheDirectory: args[3],
    manifestPath: args[1],
  };
}

function parseJson(contents: string, path: string): unknown {
  try {
    return JSON.parse(contents) as unknown;
  } catch (error) {
    throw new Error(`${path} must contain valid JSON.`, { cause: error });
  }
}
