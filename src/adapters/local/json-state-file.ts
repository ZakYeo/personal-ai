import { randomUUID } from "node:crypto";
import { basename, dirname, join } from "node:path";

import { isRecord } from "../parsing.js";
import { AtomicFileReplacementError } from "./atomic-file-replacement.js";

export interface LocalJsonStateFileSystem {
  mkdir(
    path: string,
    options: { mode: number; recursive: true },
  ): Promise<unknown>;
  readFile(path: string, options: { maxBytes: number }): Promise<string>;
  replaceFile(options: {
    contents: string;
    targetPath: string;
    temporaryPath: string;
  }): Promise<void>;
}

interface ReadLocalJsonStateOptions<TState> {
  filePath: string;
  fileSystem: LocalJsonStateFileSystem;
  invalidJsonMessage: string;
  maxBytes?: number;
  missingState(): TState;
  parse(input: unknown): TState;
  readFailureMessage: string;
}

const maxLocalJsonStateFileBytes = 4 * 1024 * 1024;

interface WriteLocalJsonStateOptions<TState> {
  filePath: string;
  fileSystem: LocalJsonStateFileSystem;
  persistenceFailureMessage: string;
  state: TState;
}

export class LocalJsonStateWriteOutcomeUnknownError extends Error {
  readonly reconciliationCause: unknown;
  readonly replacementCause: AtomicFileReplacementError;

  constructor(
    message: string,
    replacementCause: AtomicFileReplacementError,
    reconciliationCause: unknown,
  ) {
    super(`${message} The write outcome is unknown.`, {
      cause: new AggregateError(
        [replacementCause, reconciliationCause],
        "Replacement and reconciliation both failed.",
      ),
    });
    this.name = "LocalJsonStateWriteOutcomeUnknownError";
    this.reconciliationCause = reconciliationCause;
    this.replacementCause = replacementCause;
  }
}

export async function readLocalJsonState<TState>(
  options: ReadLocalJsonStateOptions<TState>,
): Promise<TState> {
  let contents: string;
  try {
    contents = await options.fileSystem.readFile(options.filePath, {
      maxBytes: options.maxBytes ?? maxLocalJsonStateFileBytes,
    });
  } catch (cause) {
    if (isRecord(cause) && cause.code === "ENOENT") {
      return options.missingState();
    }
    throw new Error(options.readFailureMessage, { cause });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(contents) as unknown;
  } catch (cause) {
    throw new Error(options.invalidJsonMessage, { cause });
  }
  return options.parse(parsed);
}

export async function writeLocalJsonState<TState>(
  options: WriteLocalJsonStateOptions<TState>,
): Promise<void> {
  const directory = dirname(options.filePath);
  const contents = `${JSON.stringify(options.state)}\n`;
  const temporaryPath = join(
    directory,
    `.${basename(options.filePath)}.${randomUUID()}.tmp`,
  );
  try {
    await options.fileSystem.mkdir(directory, {
      mode: 0o700,
      recursive: true,
    });
    await options.fileSystem.replaceFile({
      contents,
      targetPath: options.filePath,
      temporaryPath,
    });
  } catch (cause) {
    if (
      cause instanceof AtomicFileReplacementError &&
      cause.outcome === "durability_unknown"
    ) {
      let reconciliationCause: unknown;
      try {
        const visibleContents = await options.fileSystem.readFile(
          options.filePath,
          { maxBytes: new TextEncoder().encode(contents).byteLength + 1 },
        );
        if (visibleContents === contents) return;
        reconciliationCause = new Error(
          "Process-visible state did not match the intended document.",
        );
      } catch (error) {
        reconciliationCause = error;
      }
      throw new LocalJsonStateWriteOutcomeUnknownError(
        options.persistenceFailureMessage,
        cause,
        reconciliationCause,
      );
    }
    throw new Error(options.persistenceFailureMessage, { cause });
  }
}
