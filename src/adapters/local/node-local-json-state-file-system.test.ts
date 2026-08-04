import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { writeLocalJsonState } from "./json-state-file.js";
import { createNodeLocalJsonStateFileSystem } from "./node-local-json-state-file-system.js";

describe("createNodeLocalJsonStateFileSystem", () => {
  it("writes JSON state through a restrictive atomic replacement", async () => {
    const directory = await mkdtemp(join(tmpdir(), "personal-ai-state-fs-"));
    const filePath = join(directory, "state", "document.json");

    await writeLocalJsonState({
      filePath,
      fileSystem: createNodeLocalJsonStateFileSystem(),
      persistenceFailureMessage: "Could not persist test state.",
      state: { value: "stored" },
    });

    await expect(readFile(filePath, "utf8")).resolves.toBe(
      '{"value":"stored"}\n',
    );
    expect((await stat(dirname(filePath))).mode & 0o777).toBe(0o700);
    expect((await stat(filePath)).mode & 0o777).toBe(0o600);
  });

  it("rejects a state file above the requested byte limit", async () => {
    const directory = await mkdtemp(join(tmpdir(), "personal-ai-state-fs-"));
    const filePath = join(directory, "state.json");
    await writeFile(filePath, "123456", "utf8");

    await expect(
      createNodeLocalJsonStateFileSystem().readFile(filePath, { maxBytes: 5 }),
    ).rejects.toThrow("Local JSON state file exceeds 5 bytes.");
  });
});
