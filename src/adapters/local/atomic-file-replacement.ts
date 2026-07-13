import { dirname } from "node:path";

export interface AtomicFileHandle {
  close(): Promise<void>;
  sync(): Promise<void>;
  writeFile(contents: string): Promise<void>;
}

export interface AtomicFileSystem {
  open(path: string, flags: "r" | "wx"): Promise<AtomicFileHandle>;
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

  constructor(cause: unknown, cleanupCauses: readonly unknown[]) {
    super("Atomic file replacement failed.", { cause });
    this.name = "AtomicFileReplacementError";
    this.cleanupCauses = cleanupCauses;
  }
}

export async function atomicReplaceFile(
  options: AtomicReplaceFileOptions,
): Promise<void> {
  let directoryHandle: AtomicFileHandle | undefined;
  let temporaryHandle: AtomicFileHandle | undefined;
  let temporaryCreated = false;
  let renamed = false;

  try {
    temporaryHandle = await options.fileSystem.open(
      options.temporaryPath,
      "wx",
    );
    temporaryCreated = true;
    await temporaryHandle.writeFile(options.contents);
    await temporaryHandle.sync();
    await temporaryHandle.close();
    temporaryHandle = undefined;

    await options.fileSystem.rename(options.temporaryPath, options.targetPath);
    renamed = true;

    directoryHandle = await options.fileSystem.open(
      dirname(options.targetPath),
      "r",
    );
    await directoryHandle.sync();
    await directoryHandle.close();
    directoryHandle = undefined;
  } catch (cause) {
    const cleanupCauses = await collectCleanupCauses({
      ...(directoryHandle ? { directoryHandle } : {}),
      fileSystem: options.fileSystem,
      removeTemporaryFile: temporaryCreated && !renamed,
      ...(temporaryHandle ? { temporaryHandle } : {}),
      temporaryPath: options.temporaryPath,
    });

    throw new AtomicFileReplacementError(cause, cleanupCauses);
  }
}

interface CleanupOptions {
  directoryHandle?: AtomicFileHandle;
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
  await collectFailure(() => options.directoryHandle?.close(), cleanupCauses);

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
