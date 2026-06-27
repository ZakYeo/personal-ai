import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { VoiceTempFilePort } from "../../ports/voice.js";

export function createNodeVoiceTempFiles(): VoiceTempFilePort {
  const directories = new Set<string>();

  return {
    async cleanup() {
      await Promise.all(
        [...directories].map((directory) =>
          rm(directory, { force: true, recursive: true }),
        ),
      );
      directories.clear();
    },
    async createFile(filename) {
      const directory = await mkdtemp(join(tmpdir(), "personal-ai-voice-"));
      directories.add(directory);

      return join(directory, filename);
    },
  };
}
