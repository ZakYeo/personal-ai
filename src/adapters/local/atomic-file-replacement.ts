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
  readonly outcome: "durability_unknown" | "durable" | "not_applied";

  constructor(
    cause: unknown,
    cleanupCauses: readonly unknown[],
    outcome: "durability_unknown" | "durable" | "not_applied" = "not_applied",
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

    const parentCleanupCauses =
      cause instanceof ParentDirectoryError ? cause.cleanupCauses : [];
    throw new AtomicFileReplacementError(
      cause,
      [...parentCleanupCauses, ...cleanupCauses],
      !renamed
        ? "not_applied"
        : cause instanceof ParentDirectoryCleanupError
          ? "durable"
          : "durability_unknown",
    );
  }
}

const parentDirectorySyncAttempts = 3;

async function syncParentDirectory(
  fileSystem: AtomicFileSystem,
  directory: string,
): Promise<void> {
  const syncCauses: unknown[] = [];
  const cleanupCauses: unknown[] = [];

  for (let attempt = 0; attempt < parentDirectorySyncAttempts; attempt += 1) {
    let handle: AtomicFileHandle | undefined;
    try {
      handle = await fileSystem.open(directory, "r");
    } catch (cause) {
      syncCauses.push(cause);
      continue;
    }

    let synchronized = false;
    try {
      await handle.sync();
      synchronized = true;
    } catch (cause) {
      syncCauses.push(cause);
    }

    await collectFailure(() => handle.close(), cleanupCauses);

    if (synchronized) {
      if (cleanupCauses.length > 0) {
        throw new ParentDirectoryCleanupError(cleanupCauses);
      }
      return;
    }
  }

  throw new ParentDirectorySyncError(
    syncCauses,
    cleanupCauses,
    parentDirectorySyncAttempts,
  );
}

abstract class ParentDirectoryError extends Error {
  constructor(
    message: string,
    readonly cleanupCauses: readonly unknown[],
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

class ParentDirectoryCleanupError extends ParentDirectoryError {
  constructor(cleanupCauses: readonly unknown[]) {
    super(
      "Parent directory handle cleanup failed after successful synchronization.",
      cleanupCauses,
      {
        cause: new AggregateError(
          cleanupCauses,
          "Parent directory handle cleanup failed.",
        ),
      },
    );
  }
}

class ParentDirectorySyncError extends ParentDirectoryError {
  constructor(
    syncCauses: readonly unknown[],
    cleanupCauses: readonly unknown[],
    attempts: number,
  ) {
    super(
      `Parent directory synchronization failed after ${attempts} attempts.`,
      cleanupCauses,
      {
        cause: new AggregateError(
          syncCauses,
          "Parent directory synchronization attempts failed.",
        ),
      },
    );
  }
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
