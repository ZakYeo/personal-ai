import { dirname } from "node:path";

export interface AtomicFileHandle {
  close(): Promise<void>;
  sync(): Promise<void>;
  writeFile(contents: string): Promise<void>;
}

export interface AtomicFileSystem {
  open(
    path: string,
    flags: "r" | "wx",
    mode?: number,
  ): Promise<AtomicFileHandle>;
  rename(from: string, to: string): Promise<void>;
  unlink(path: string): Promise<void>;
}

interface AtomicReplaceFileOptions {
  contents: string;
  fileSystem: AtomicFileSystem;
  targetPath: string;
  temporaryPath: string;
}

export class AtomicFileReplacementError extends Error {
  readonly cleanupCauses: readonly unknown[];
  readonly outcome: "durability_unknown" | "not_applied";

  constructor(
    cause: unknown,
    cleanupCauses: readonly unknown[],
    outcome: "durability_unknown" | "not_applied" = "not_applied",
  ) {
    super("Atomic file replacement failed.", { cause });
    this.name = "AtomicFileReplacementError";
    this.cleanupCauses = cleanupCauses;
    this.outcome = outcome;
  }
}

export async function atomicReplaceFile(
  options: AtomicReplaceFileOptions,
): Promise<void> {
  let temporaryHandle: AtomicFileHandle | undefined;
  let temporaryCreated = false;
  let renamed = false;

  try {
    temporaryHandle = await options.fileSystem.open(
      options.temporaryPath,
      "wx",
      0o600,
    );
    temporaryCreated = true;
    await temporaryHandle.writeFile(options.contents);
    await temporaryHandle.sync();
    await temporaryHandle.close();
    temporaryHandle = undefined;

    await options.fileSystem.rename(options.temporaryPath, options.targetPath);
    renamed = true;

    await syncParentDirectory(options.fileSystem, dirname(options.targetPath));
  } catch (cause) {
    const cleanupCauses = await collectCleanupCauses({
      fileSystem: options.fileSystem,
      removeTemporaryFile: temporaryCreated && !renamed,
      ...(temporaryHandle ? { temporaryHandle } : {}),
      temporaryPath: options.temporaryPath,
    });

    throw new AtomicFileReplacementError(
      cause,
      cleanupCauses,
      renamed ? "durability_unknown" : "not_applied",
    );
  }
}

const parentDirectorySyncAttempts = 3;

async function syncParentDirectory(
  fileSystem: AtomicFileSystem,
  directory: string,
): Promise<void> {
  const causes: unknown[] = [];

  for (let attempt = 0; attempt < parentDirectorySyncAttempts; attempt += 1) {
    let handle: AtomicFileHandle | undefined;
    let failed = false;
    try {
      handle = await fileSystem.open(directory, "r");
      await handle.sync();
    } catch (cause) {
      failed = true;
      causes.push(cause);
    }

    if (handle) {
      try {
        await handle.close();
      } catch (cause) {
        failed = true;
        causes.push(cause);
      }
    }

    if (!failed) return;
  }

  throw new AggregateError(
    causes,
    `Parent directory synchronization failed after ${parentDirectorySyncAttempts} attempts.`,
  );
}

interface CleanupOptions {
  fileSystem: AtomicFileSystem;
  removeTemporaryFile: boolean;
  temporaryHandle?: AtomicFileHandle;
  temporaryPath: string;
}

async function collectCleanupCauses(
  options: CleanupOptions,
): Promise<unknown[]> {
  const cleanupCauses: unknown[] = [];

  await collectFailure(() => options.temporaryHandle?.close(), cleanupCauses);

  if (options.removeTemporaryFile) {
    await collectFailure(
      () => options.fileSystem.unlink(options.temporaryPath),
      cleanupCauses,
    );
  }

  return cleanupCauses;
}

async function collectFailure(
  cleanup: () => Promise<void> | undefined,
  causes: unknown[],
): Promise<void> {
  try {
    await cleanup();
  } catch (cause) {
    causes.push(cause);
  }
}
