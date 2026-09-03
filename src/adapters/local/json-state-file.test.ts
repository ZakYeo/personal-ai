import { AtomicFileReplacementError } from "./atomic-file-replacement.js";
import {
  type LocalJsonStateFileSystem,
  type LocalJsonStateWriteOutcomeUnknownError,
  writeLocalJsonState,
} from "./json-state-file.js";

describe("writeLocalJsonState", () => {
  it("reconciles an exact process-visible document after durability becomes unknown", async () => {
    const readFile = vi.fn(() => Promise.resolve('{"value":"saved"}\n'));
    const fileSystem = createFileSystem({ readFile });

    await expect(
      writeLocalJsonState({
        filePath: "/state/document.json",
        fileSystem,
        persistenceFailureMessage: "Could not persist test state.",
        state: { value: "saved" },
      }),
    ).resolves.toBeUndefined();

    expect(readFile).toHaveBeenCalledWith("/state/document.json", {
      maxBytes: 19,
    });
  });

  it("reports an explicit unknown outcome when visible state differs", async () => {
    const replacementCause = durabilityUnknownFailure();

    await expect(
      writeLocalJsonState({
        filePath: "/state/document.json",
        fileSystem: createFileSystem({
          readFile: () => Promise.resolve('{"value":"old"}\n'),
          replacementCause,
        }),
        persistenceFailureMessage: "Could not persist test state.",
        state: { value: "saved" },
      }),
    ).rejects.toMatchObject({
      message: "Could not persist test state. The write outcome is unknown.",
      name: "LocalJsonStateWriteOutcomeUnknownError",
      replacementCause,
    } satisfies Partial<LocalJsonStateWriteOutcomeUnknownError>);
  });

  it("keeps pre-replacement failures on the ordinary persistence path", async () => {
    const replacementCause = new AtomicFileReplacementError(
      new Error("rename failed"),
      [],
      "not_applied",
    );

    await expect(
      writeLocalJsonState({
        filePath: "/state/document.json",
        fileSystem: createFileSystem({ replacementCause }),
        persistenceFailureMessage: "Could not persist test state.",
        state: { value: "saved" },
      }),
    ).rejects.toMatchObject({
      cause: replacementCause,
      message: "Could not persist test state.",
    });
  });
});

function createFileSystem(options: {
  readFile?: LocalJsonStateFileSystem["readFile"];
  replacementCause?: AtomicFileReplacementError;
}): LocalJsonStateFileSystem {
  const replacementCause =
    options.replacementCause ?? durabilityUnknownFailure();
  return {
    mkdir: () => Promise.resolve(),
    readFile:
      options.readFile ?? (() => Promise.reject(new Error("read failed"))),
    replaceFile: () => Promise.reject(replacementCause),
  };
}

function durabilityUnknownFailure(): AtomicFileReplacementError {
  return new AtomicFileReplacementError(
    new Error("directory sync failed"),
    [],
    "durability_unknown",
  );
}
