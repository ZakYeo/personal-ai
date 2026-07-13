import {
  atomicReplaceFile,
  AtomicFileReplacementError,
  type AtomicFileHandle,
  type AtomicFileSystem,
} from "./atomic-file-replacement.js";

describe("atomicReplaceFile", () => {
  it("syncs file contents before rename and the directory after rename", async () => {
    const events: string[] = [];
    const fileSystem = createFileSystem(events);

    await atomicReplaceFile({
      contents: "state",
      fileSystem,
      targetPath: "/state/alarms.json",
      temporaryPath: "/state/.alarms.json.tmp",
    });

    expect(events).toEqual([
      "open /state/.alarms.json.tmp wx",
      "file write state",
      "file sync",
      "file close",
      "rename /state/.alarms.json.tmp /state/alarms.json",
      "open /state r",
      "directory sync",
      "directory close",
    ]);
  });

  it.each(["write", "sync", "close"] as const)(
    "closes and removes the temporary file after a file %s failure",
    async (failure) => {
      const events: string[] = [];
      const fileSystem = createFileSystem(events, { fileFailure: failure });

      const error = await atomicReplaceFile({
        contents: "state",
        fileSystem,
        targetPath: "/state/alarms.json",
        temporaryPath: "/state/.alarms.json.tmp",
      }).catch((cause: unknown) => cause);

      expectAtomicFailure(error, `${failure} failed`);
      expect(events).toContain("unlink /state/.alarms.json.tmp");
      expect(events).not.toContain(
        "rename /state/.alarms.json.tmp /state/alarms.json",
      );
    },
  );

  it("removes the temporary file after rename failure", async () => {
    const events: string[] = [];
    const fileSystem = createFileSystem(events, { renameFailure: true });

    const error = await atomicReplaceFile({
      contents: "state",
      fileSystem,
      targetPath: "/state/alarms.json",
      temporaryPath: "/state/.alarms.json.tmp",
    }).catch((cause: unknown) => cause);

    expectAtomicFailure(error, "rename failed");
    expect(events.at(-1)).toBe("unlink /state/.alarms.json.tmp");
  });

  it("syncs and closes the directory even when directory sync fails", async () => {
    const events: string[] = [];
    const fileSystem = createFileSystem(events, { directorySyncFailure: true });

    const error = await atomicReplaceFile({
      contents: "state",
      fileSystem,
      targetPath: "/state/alarms.json",
      temporaryPath: "/state/.alarms.json.tmp",
    }).catch((cause: unknown) => cause);

    expectAtomicFailure(error, "sync failed");
    expect(events.at(-1)).toBe("directory close");
    expect(events).not.toContain("unlink /state/.alarms.json.tmp");
  });

  it("retains cleanup failures without replacing the primary failure", async () => {
    const events: string[] = [];
    const fileSystem = createFileSystem(events, {
      renameFailure: true,
      unlinkFailure: true,
    });

    const error = await atomicReplaceFile({
      contents: "state",
      fileSystem,
      targetPath: "/state/alarms.json",
      temporaryPath: "/state/.alarms.json.tmp",
    }).catch((cause: unknown) => cause);

    expectAtomicFailure(error, "rename failed");
    if (!(error instanceof AtomicFileReplacementError)) {
      throw new TypeError("Expected an atomic replacement failure.");
    }
    expect(error.cleanupCauses).toHaveLength(1);
    expect(error.cleanupCauses[0]).toMatchObject({ message: "unlink failed" });
  });
});

interface FailureOptions {
  directorySyncFailure?: boolean;
  fileFailure?: "close" | "sync" | "write";
  renameFailure?: boolean;
  unlinkFailure?: boolean;
}

function createFileSystem(
  events: string[],
  failures: FailureOptions = {},
): AtomicFileSystem {
  return {
    open: (path, flags) => {
      events.push(`open ${path} ${flags}`);
      return Promise.resolve(
        path === "/state"
          ? createHandle("directory", events, {
              sync: failures.directorySyncFailure,
            })
          : createHandle("file", events, {
              [failures.fileFailure ?? "none"]: true,
            }),
      );
    },
    rename: (from, to) => {
      events.push(`rename ${from} ${to}`);
      return failures.renameFailure
        ? Promise.reject(new Error("rename failed"))
        : Promise.resolve();
    },
    unlink: (path) => {
      events.push(`unlink ${path}`);
      return failures.unlinkFailure
        ? Promise.reject(new Error("unlink failed"))
        : Promise.resolve();
    },
  };
}

function createHandle(
  label: string,
  events: string[],
  failures: Record<string, boolean | undefined>,
): AtomicFileHandle {
  return {
    close: () => runHandleEvent(label, "close", events, failures.close),
    sync: () => runHandleEvent(label, "sync", events, failures.sync),
    writeFile: (contents) =>
      runHandleEvent(label, `write ${contents}`, events, failures.write),
  };
}

function runHandleEvent(
  label: string,
  event: string,
  events: string[],
  shouldFail: boolean | undefined,
): Promise<void> {
  events.push(`${label} ${event}`);
  return shouldFail
    ? Promise.reject(new Error(`${event.split(" ")[0]} failed`))
    : Promise.resolve();
}

function expectAtomicFailure(error: unknown, causeMessage: string): void {
  expect(error).toBeInstanceOf(AtomicFileReplacementError);
  if (!(error instanceof AtomicFileReplacementError)) {
    throw new TypeError("Expected an atomic replacement failure.");
  }
  expect(error.cause).toMatchObject({ message: causeMessage });
}
