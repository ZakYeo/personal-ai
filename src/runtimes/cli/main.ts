#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createConfiguredTextRuntime } from "../configured-text-runtime.js";
import {
  logFeatureDiagnostics,
  logRuntimeFailure,
  safeRuntimeFallbackResponse,
} from "../human-boundary.js";
import { createDesktopVoiceRuntime } from "../voice/desktop-voice-runtime.js";
import { runDesktopVoiceServiceRuntime } from "../voice/desktop-voice-service-runtime.js";
import { createMockVoiceRuntime } from "../voice/mock-voice-runtime.js";
import { runPiServiceRuntime } from "../pi/pi-service-runtime.js";
import type { AssistantResponse } from "../../ports/assistant.js";
import type { Assistant } from "../../core/assistant/index.js";
import type {
  ServiceProcessSignals,
  ServiceRuntimeResult,
} from "../service/service-runtime.js";

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
  kind: "desktop-voice-once" | "voice-once";
  configPath?: string;
  utterance?: string;
}

interface ParsedPiServiceCommand {
  kind: "pi-service";
  configPath: string;
}

interface ParsedDesktopVoiceServiceCommand {
  kind: "desktop-voice-service";
  configPath: string;
}

type ParsedCliCommand =
  | ParsedAskCommand
  | ParsedDesktopVoiceServiceCommand
  | ParsedPiServiceCommand
  | ParsedVoiceCommand;

interface CliDependencies {
  createDesktopVoiceServiceRuntime?: typeof runDesktopVoiceServiceRuntime;
  createDesktopVoiceRuntime?: typeof createDesktopVoiceRuntime;
  createPiServiceRuntime?: typeof runPiServiceRuntime;
  createRuntime?: typeof createConfiguredTextRuntime;
  createVoiceRuntime?: typeof createMockVoiceRuntime;
  processSignals?: ServiceProcessSignals;
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

  if (parsed.kind === "pi-service") {
    const result = await handlePiServiceCommand(parsed, io, dependencies);

    if (result.status !== "stopped") {
      io.stdout.write(`${result.response.text}\n`);
      return 1;
    }

    return 0;
  }

  if (parsed.kind === "desktop-voice-service") {
    const result = await handleDesktopVoiceServiceCommand(
      parsed,
      io,
      dependencies,
    );

    if (result.status !== "stopped") {
      io.stdout.write(`${result.response.text}\n`);
      return 1;
    }

    return 0;
  }

  if (parsed.kind === "voice-once" || parsed.kind === "desktop-voice-once") {
    const result = await handleVoiceCommand(parsed, io, dependencies);

    if (!result.outputWritten) {
      io.stdout.write(`${result.response.text}\n`);
    }

    return result.response.status === "error" ? 1 : 0;
  }

  if (parsed.kind === "ask") {
    const response = await handleRuntimeCommand(parsed, io, dependencies);

    io.stdout.write(`${response.text}\n`);
    return response.status === "error" ? 1 : 0;
  }

  io.stderr.write(`${usage()}\n`);
  return 1;
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
): Parameters<typeof createConfiguredTextRuntime>[0] {
  const fixedNow = env.PERSONAL_AI_FIXED_NOW;

  return {
    env,
    ...(parsed.configPath ? { configPath: parsed.configPath } : {}),
    ...(fixedNow ? { now: () => new Date(fixedNow) } : {}),
  };
}

function buildVoiceRuntimeOptions(
  parsed: ParsedVoiceCommand,
  env: NodeJS.ProcessEnv,
  io: CliIo,
): Parameters<typeof createMockVoiceRuntime>[0] {
  const fixedNow = env.PERSONAL_AI_FIXED_NOW;

  return {
    env,
    io: {
      fallbackOutput: io.stdout,
      stderr: io.stderr,
    },
    ...(parsed.configPath ? { configPath: parsed.configPath } : {}),
    ...(fixedNow ? { now: () => new Date(fixedNow) } : {}),
    ...(parsed.utterance ? { utterance: parsed.utterance } : {}),
  };
}

function buildPiServiceRuntimeOptions(
  parsed: ParsedPiServiceCommand,
  env: NodeJS.ProcessEnv,
  io: CliIo,
  dependencies: CliDependencies,
): Parameters<typeof runPiServiceRuntime>[0] {
  const fixedNow = env.PERSONAL_AI_FIXED_NOW;

  return {
    configPath: parsed.configPath,
    env,
    io: {
      fallbackOutput: io.stdout,
      stderr: io.stderr,
    },
    ...(fixedNow ? { now: () => new Date(fixedNow) } : {}),
    processSignals:
      dependencies.processSignals ?? createNodeProcessSignals(process),
  };
}

function buildDesktopVoiceServiceRuntimeOptions(
  parsed: ParsedDesktopVoiceServiceCommand,
  env: NodeJS.ProcessEnv,
  io: CliIo,
  dependencies: CliDependencies,
): Parameters<typeof runDesktopVoiceServiceRuntime>[0] {
  const fixedNow = env.PERSONAL_AI_FIXED_NOW;

  return {
    configPath: parsed.configPath,
    env,
    io: {
      fallbackOutput: io.stdout,
      stderr: io.stderr,
    },
    ...(fixedNow ? { now: () => new Date(fixedNow) } : {}),
    processSignals:
      dependencies.processSignals ?? createNodeProcessSignals(process),
  };
}

async function handleRuntimeCommand(
  parsed: ParsedAskCommand,
  io: CliIo,
  dependencies: CliDependencies,
): Promise<AssistantResponse> {
  try {
    const createRuntime =
      dependencies.createRuntime ?? createConfiguredTextRuntime;
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
      parsed.kind === "desktop-voice-once"
        ? (dependencies.createDesktopVoiceRuntime ?? createDesktopVoiceRuntime)
        : (dependencies.createVoiceRuntime ?? createMockVoiceRuntime);
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

async function handlePiServiceCommand(
  parsed: ParsedPiServiceCommand,
  io: CliIo,
  dependencies: CliDependencies,
): Promise<ServiceRuntimeResult> {
  try {
    const createPiServiceRuntime =
      dependencies.createPiServiceRuntime ?? runPiServiceRuntime;

    return await createPiServiceRuntime(
      buildPiServiceRuntimeOptions(parsed, io.env, io, dependencies),
    );
  } catch (error) {
    logRuntimeFailure(error, io);

    return {
      response: safeRuntimeFallbackResponse,
      status: "startup_failed",
      turnsCompleted: 0,
    };
  }
}

async function handleDesktopVoiceServiceCommand(
  parsed: ParsedDesktopVoiceServiceCommand,
  io: CliIo,
  dependencies: CliDependencies,
): Promise<ServiceRuntimeResult> {
  try {
    const createDesktopVoiceServiceRuntime =
      dependencies.createDesktopVoiceServiceRuntime ??
      runDesktopVoiceServiceRuntime;

    return await createDesktopVoiceServiceRuntime(
      buildDesktopVoiceServiceRuntimeOptions(parsed, io.env, io, dependencies),
    );
  } catch (error) {
    logRuntimeFailure(error, io);

    return {
      response: safeRuntimeFallbackResponse,
      status: "startup_failed",
      turnsCompleted: 0,
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

  if (args[0] === "desktop-voice-once") {
    return parseDesktopVoiceCommand(args);
  }

  if (args[0] === "desktop-voice-service") {
    return parseDesktopVoiceServiceCommand(args);
  }

  if (args[0] === "pi-service") {
    return parsePiServiceCommand(args);
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

function parseDesktopVoiceCommand(
  args: string[],
): ParsedVoiceCommand | undefined {
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
    } else {
      return undefined;
    }
  }

  return {
    kind: "desktop-voice-once",
    ...(configPath ? { configPath } : {}),
  };
}

function parsePiServiceCommand(
  args: string[],
): ParsedPiServiceCommand | undefined {
  return parseRequiredConfigCommand(args, "pi-service");
}

function parseDesktopVoiceServiceCommand(
  args: string[],
): ParsedDesktopVoiceServiceCommand | undefined {
  return parseRequiredConfigCommand(args, "desktop-voice-service");
}

function parseRequiredConfigCommand<
  TKind extends
    | ParsedPiServiceCommand["kind"]
    | ParsedDesktopVoiceServiceCommand["kind"],
>(
  args: string[],
  kind: TKind,
): { configPath: string; kind: TKind } | undefined {
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
    } else {
      return undefined;
    }
  }

  if (!configPath) {
    return undefined;
  }

  return {
    configPath,
    kind,
  };
}

function createNodeProcessSignals(
  processState: Pick<NodeJS.Process, "off" | "on">,
): ServiceProcessSignals {
  return {
    onSignal(signal, handler) {
      processState.on(signal, handler);

      return () => {
        processState.off(signal, handler);
      };
    },
  };
}

function usage(): string {
  return [
    'Usage: personal-ai ask [--config path/to/config.json] "command text"',
    '       personal-ai voice-once [--config path/to/config.json] [--utterance "spoken command"]',
    "       personal-ai desktop-voice-once [--config path/to/config.json]",
    "       personal-ai desktop-voice-service --config path/to/desktop-config.json",
    "       personal-ai pi-service --config path/to/pi-config.json",
  ].join("\n");
}
