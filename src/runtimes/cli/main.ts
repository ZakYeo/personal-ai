#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  logRuntimeFailure,
  safeRuntimeFallbackResponse,
} from "../human-boundary.js";
import { runCliCommand } from "./commands.js";
import type { CliDependencies, CliIo, ProcessState } from "./types.js";

export async function main(
  args: string[] = process.argv.slice(2),
  io: CliIo = {
    env: process.env,
    stderr: process.stderr,
    stdout: process.stdout,
  },
  dependencies: CliDependencies = {},
): Promise<number> {
  return runCliCommand(args, io, dependencies);
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  void runCliEntryPoint(
    () => main(),
    {
      env: process.env,
      stderr: process.stderr,
      stdout: process.stdout,
    },
    process,
  );
}

export async function runCliEntryPoint(
  run: () => Promise<number>,
  io: CliIo,
  processState: ProcessState,
): Promise<void> {
  try {
    processState.exitCode = await run();
  } catch (error) {
    logRuntimeFailure(error, io);
    io.stdout.write(`${safeRuntimeFallbackResponse.text}\n`);
    processState.exitCode = 1;
  }
}
