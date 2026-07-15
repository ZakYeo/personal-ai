import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";

import { runVoiceArtifactVerifyCli } from "./artifact-verify-cli.js";

process.exitCode = await runVoiceArtifactVerifyCli(process.argv.slice(2), {
  inspectFile: async (path) => {
    let fileSize: number;
    try {
      fileSize = (await stat(path)).size;
    } catch (error) {
      if (isMissingFileError(error)) {
        return;
      }
      throw error;
    }

    const hash = createHash("sha256");
    for await (const chunk of createReadStream(path)) {
      const streamChunk: unknown = chunk;
      if (!Buffer.isBuffer(streamChunk)) {
        throw new Error(
          `Artifact stream for ${path} emitted a non-buffer chunk.`,
        );
      }
      hash.update(streamChunk);
    }
    return { sha256: hash.digest("hex"), sizeBytes: fileSize };
  },
  now: () => new Date(),
  readTextFile: (path) => readFile(path, "utf8"),
  writeLine: (line) => console.log(line),
});

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
