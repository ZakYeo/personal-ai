#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter } from "node:path";
import { fileURLToPath } from "node:url";
import {
  runPiQemuSmokeCore,
  type PiQemuSmokeDependencies,
} from "./pi-qemu-smoke-core.js";

export async function runPiQemuSmoke(
  args: string[],
  dependencies: PiQemuSmokeDependencies,
): Promise<number> {
  return runPiQemuSmokeCore(args, dependencies);
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = await runPiQemuSmoke(
    process.argv.slice(2),
    createNodePiQemuSmokeDependencies(),
  );
}

function createNodePiQemuSmokeDependencies(): PiQemuSmokeDependencies {
  return {
    commandExists,
    fileExists: existsSync,
    spawn: spawnQemu,
    stderr: process.stderr,
    stdout: process.stdout,
  };
}

function commandExists(command: string): boolean {
  if (command.includes("/")) {
    return existsSync(command);
  }

  const pathValue = process.env.PATH;

  if (!pathValue) {
    return false;
  }

  return pathValue.split(delimiter).some((pathEntry) => {
    return existsSync(`${pathEntry}/${command}`);
  });
}

function spawnQemu(command: string, args: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });

    child.once("error", reject);
    child.once("close", (exitCode) => {
      resolve(exitCode ?? 1);
    });
  });
}
