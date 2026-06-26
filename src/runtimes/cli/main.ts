#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDeterministicRuntime } from "../deterministic-runtime.js";
import type { AssistantResponse } from "../../ports/assistant.js";
import type { Assistant } from "../../core/assistant/index.js";
import type { AppError } from "../../core/assistant/app-error.js";

interface CliIo {
  env: NodeJS.ProcessEnv;
  stderr: Pick<NodeJS.WriteStream, "write">;
  stdout: Pick<NodeJS.WriteStream, "write">;
}

interface ParsedAskCommand {
  commandText: string;
  configPath?: string;
}

interface CliDependencies {
  createRuntime?: typeof createDeterministicRuntime;
}

interface ProcessState {
  exitCode?: number;
}

export async function main(
  args: string[] = process.argv.slice(2),
  io: CliIo = {
    env: process.env,
    stderr: process.stderr,
    stdout: process.stdout,
  },
  dependencies: CliDependencies = {},
): Promise<number> {
  const parsed = parseAskCommand(args);

  if (!parsed) {
    io.stderr.write(`${usage()}\n`);
    return 1;
  }

  const response = await handleRuntimeCommand(parsed, io, dependencies);

  io.stdout.write(`${response.text}\n`);
  return response.status === "error" ? 1 : 0;
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
    io.stdout.write("I hit a problem and could not complete that.\n");
    processState.exitCode = 1;
  }
}

function buildRuntimeOptions(
  parsed: ParsedAskCommand,
  env: NodeJS.ProcessEnv,
): Parameters<typeof createDeterministicRuntime>[0] {
  const fixedNow = env.PERSONAL_AI_FIXED_NOW;

  return {
    ...(parsed.configPath ? { configPath: parsed.configPath } : {}),
    ...(fixedNow ? { now: new Date(fixedNow) } : {}),
  };
}

async function handleRuntimeCommand(
  parsed: ParsedAskCommand,
  io: CliIo,
  dependencies: CliDependencies,
): Promise<AssistantResponse> {
  try {
    const createRuntime =
      dependencies.createRuntime ?? createDeterministicRuntime;
    const runtime = await createRuntime(buildRuntimeOptions(parsed, io.env));
    const outcome = await handleRuntimeText(runtime, parsed.commandText);

    logDiagnostics(outcome.diagnostics ?? [], io);

    return outcome.response;
  } catch (error) {
    logRuntimeFailure(error, io);

    return {
      status: "error",
      text: "I hit a problem and could not complete that.",
    };
  }
}

async function handleRuntimeText(
  runtime: Assistant,
  commandText: string,
): ReturnType<Assistant["handleTextWithDiagnostics"]> {
  return runtime.handleTextWithDiagnostics(commandText);
}

function logDiagnostics(diagnostics: AppError[], io: CliIo): void {
  for (const diagnostic of diagnostics) {
    if (diagnostic.category === "feature_failure") {
      const capability = diagnostic.capability
        ? ` in ${diagnostic.capability}`
        : "";

      io.stderr.write(`Feature failure${capability}: ${diagnostic.message}\n`);
    }
  }
}

function logRuntimeFailure(error: unknown, io: CliIo): void {
  const message = error instanceof Error ? error.message : String(error);

  io.stderr.write(`Runtime failure: ${message}\n`);
}

function parseAskCommand(args: string[]): ParsedAskCommand | undefined {
  if (args[0] !== "ask") {
    return undefined;
  }

  const commandParts: string[] = [];
  let configPath: string | undefined;

  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--config") {
      const nextArg = args[index + 1];

      if (!nextArg) {
        return undefined;
      }

      configPath = nextArg;
      index += 1;
    } else if (arg) {
      commandParts.push(arg);
    }
  }

  if (commandParts.length === 0) {
    return undefined;
  }

  return {
    commandText: commandParts.join(" "),
    ...(configPath ? { configPath } : {}),
  };
}

function usage(): string {
  return 'Usage: personal-ai ask [--config path/to/config.json] "command text"';
}
