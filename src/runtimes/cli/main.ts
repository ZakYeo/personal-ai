#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDeterministicRuntime } from "../deterministic-runtime.js";
import {
  logFeatureDiagnostics,
  logRuntimeFailure,
  safeRuntimeFallbackResponse,
} from "../human-boundary.js";
import { createMockVoiceRuntime } from "../voice/mock-voice-runtime.js";
import type { AssistantResponse } from "../../ports/assistant.js";
import type { Assistant } from "../../core/assistant/index.js";

interface CliIo {
  env: NodeJS.ProcessEnv;
  stderr: Pick<NodeJS.WriteStream, "write">;
  stdout: Pick<NodeJS.WriteStream, "write">;
}

interface ParsedAskCommand {
  kind: "ask";
  commandText: string;
  configPath?: string;
}

interface ParsedVoiceCommand {
  kind: "voice-once";
  configPath?: string;
  utterance?: string;
}

type ParsedCliCommand = ParsedAskCommand | ParsedVoiceCommand;

interface CliDependencies {
  createRuntime?: typeof createDeterministicRuntime;
  createVoiceRuntime?: typeof createMockVoiceRuntime;
}

interface ProcessState {
  exitCode?: NodeJS.Process["exitCode"];
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
  const parsed = parseCliCommand(args);

  if (!parsed) {
    io.stderr.write(`${usage()}\n`);
    return 1;
  }

  if (parsed.kind === "voice-once") {
    const result = await handleVoiceCommand(parsed, io, dependencies);

    if (!result.outputWritten) {
      io.stdout.write(`${result.response.text}\n`);
    }

    return result.response.status === "error" ? 1 : 0;
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
    io.stdout.write(`${safeRuntimeFallbackResponse.text}\n`);
    processState.exitCode = 1;
  }
}

function buildRuntimeOptions(
  parsed: ParsedAskCommand | ParsedVoiceCommand,
  env: NodeJS.ProcessEnv,
): Parameters<typeof createDeterministicRuntime>[0] {
  const fixedNow = env.PERSONAL_AI_FIXED_NOW;

  return {
    ...(parsed.configPath ? { configPath: parsed.configPath } : {}),
    ...(fixedNow ? { now: new Date(fixedNow) } : {}),
  };
}

function buildVoiceRuntimeOptions(
  parsed: ParsedVoiceCommand,
  env: NodeJS.ProcessEnv,
  io: CliIo,
): Parameters<typeof createMockVoiceRuntime>[0] {
  const fixedNow = env.PERSONAL_AI_FIXED_NOW;

  return {
    io: {
      fallbackOutput: io.stdout,
      stderr: io.stderr,
    },
    ...(parsed.configPath ? { configPath: parsed.configPath } : {}),
    ...(fixedNow ? { now: new Date(fixedNow) } : {}),
    ...(parsed.utterance ? { utterance: parsed.utterance } : {}),
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

    logFeatureDiagnostics(outcome.diagnostics ?? [], io);

    return outcome.response;
  } catch (error) {
    logRuntimeFailure(error, io);

    return safeRuntimeFallbackResponse;
  }
}

async function handleVoiceCommand(
  parsed: ParsedVoiceCommand,
  io: CliIo,
  dependencies: CliDependencies,
): Promise<{ outputWritten: boolean; response: AssistantResponse }> {
  try {
    const createVoiceRuntime =
      dependencies.createVoiceRuntime ?? createMockVoiceRuntime;
    const runtime = await createVoiceRuntime(
      buildVoiceRuntimeOptions(parsed, io.env, io),
    );
    const result = await runtime.runOnce();

    return {
      outputWritten: result.textOutputWritten,
      response: result.response,
    };
  } catch (error) {
    logRuntimeFailure(error, io);

    return {
      outputWritten: false,
      response: safeRuntimeFallbackResponse,
    };
  }
}

function handleRuntimeText(
  runtime: Assistant,
  commandText: string,
): ReturnType<Assistant["handleTextWithDiagnostics"]> {
  return runtime.handleTextWithDiagnostics(commandText);
}

function parseCliCommand(args: string[]): ParsedCliCommand | undefined {
  if (args[0] === "ask") {
    return parseAskCommand(args);
  }

  if (args[0] === "voice-once") {
    return parseVoiceCommand(args);
  }

  return undefined;
}

function parseAskCommand(args: string[]): ParsedAskCommand | undefined {
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
    kind: "ask",
    commandText: commandParts.join(" "),
    ...(configPath ? { configPath } : {}),
  };
}

function parseVoiceCommand(args: string[]): ParsedVoiceCommand | undefined {
  let configPath: string | undefined;
  let utterance: string | undefined;

  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--config") {
      const nextArg = args[index + 1];

      if (!nextArg) {
        return undefined;
      }

      configPath = nextArg;
      index += 1;
    } else if (arg === "--utterance") {
      const nextArg = args[index + 1];

      if (!nextArg) {
        return undefined;
      }

      utterance = nextArg;
      index += 1;
    } else {
      return undefined;
    }
  }

  return {
    kind: "voice-once",
    ...(configPath ? { configPath } : {}),
    ...(utterance ? { utterance } : {}),
  };
}

function usage(): string {
  return [
    'Usage: personal-ai ask [--config path/to/config.json] "command text"',
    '       personal-ai voice-once [--config path/to/config.json] [--utterance "spoken command"]',
  ].join("\n");
}
