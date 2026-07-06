import { createConfiguredTextRuntime } from "../configured-text-runtime.js";
import {
  logFeatureDiagnostics,
  logRuntimeFailure,
  safeRuntimeFallbackResponse,
} from "../human-boundary.js";
import { runPiServiceRuntime } from "../pi/pi-service-runtime.js";
import type { ServiceProcessSignals } from "../service/service-runtime.js";
import { runDesktopVoiceServiceRuntime } from "../voice/desktop-voice-service-runtime.js";
import { createDesktopVoiceRuntime } from "../voice/desktop-voice-runtime.js";
import { createMockVoiceRuntime } from "../voice/mock-voice-runtime.js";
import type { Assistant } from "../../core/assistant/index.js";
import type { AssistantResponse } from "../../ports/assistant.js";
import type { CliDependencies, CliIo } from "./types.js";

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

interface CliCommandDefinition<TCommand extends ParsedCliCommand> {
  name: TCommand["kind"];
  parse(args: string[]): TCommand | undefined;
  run(
    parsed: TCommand,
    io: CliIo,
    dependencies: CliDependencies,
  ): Promise<number>;
  usage: string;
}

type AnyCliCommandDefinition = CliCommandDefinition<ParsedCliCommand>;

const cliCommands = [
  {
    name: "ask",
    parse: parseAskCommand,
    run: runAskCommand,
    usage: 'personal-ai ask [--config path/to/config.json] "command text"',
  },
  {
    name: "voice-once",
    parse: parseVoiceCommand,
    run: runVoiceCommand,
    usage:
      'personal-ai voice-once [--config path/to/config.json] [--utterance "spoken command"]',
  },
  {
    name: "desktop-voice-once",
    parse: parseDesktopVoiceCommand,
    run: runVoiceCommand,
    usage: "personal-ai desktop-voice-once [--config path/to/config.json]",
  },
  {
    name: "desktop-voice-service",
    parse: parseDesktopVoiceServiceCommand,
    run: runDesktopVoiceServiceCommand,
    usage:
      "personal-ai desktop-voice-service --config path/to/desktop-config.json",
  },
  {
    name: "pi-service",
    parse: parsePiServiceCommand,
    run: runPiServiceCommand,
    usage: "personal-ai pi-service --config path/to/pi-config.json",
  },
] satisfies AnyCliCommandDefinition[];

export async function runCliCommand(
  args: string[],
  io: CliIo,
  dependencies: CliDependencies,
): Promise<number> {
  const command = findCliCommand(args[0]);
  const parsed = command?.parse(args);

  if (!command || !parsed) {
    io.stderr.write(`${usage()}\n`);
    return 1;
  }

  return command.run(parsed, io, dependencies);
}

export function usage(): string {
  return cliCommands
    .map(
      (command, index) =>
        `${index === 0 ? "Usage: " : "       "}${command.usage}`,
    )
    .join("\n");
}

function findCliCommand(
  commandName: string | undefined,
): AnyCliCommandDefinition | undefined {
  return cliCommands.find((command) => command.name === commandName);
}

async function runAskCommand(
  parsed: ParsedAskCommand,
  io: CliIo,
  dependencies: CliDependencies,
): Promise<number> {
  const response = await handleRuntimeCommand(parsed, io, dependencies);

  io.stdout.write(`${response.text}\n`);
  return response.status === "error" ? 1 : 0;
}

async function runVoiceCommand(
  parsed: ParsedVoiceCommand,
  io: CliIo,
  dependencies: CliDependencies,
): Promise<number> {
  const result = await handleVoiceCommand(parsed, io, dependencies);

  if (!result.outputWritten) {
    io.stdout.write(`${result.response.text}\n`);
  }

  return result.response.status === "error" ? 1 : 0;
}

async function runPiServiceCommand(
  parsed: ParsedPiServiceCommand,
  io: CliIo,
  dependencies: CliDependencies,
): Promise<number> {
  const result = await handlePiServiceCommand(parsed, io, dependencies);

  if (result.status !== "stopped") {
    io.stdout.write(`${result.response.text}\n`);
    return 1;
  }

  return 0;
}

async function runDesktopVoiceServiceCommand(
  parsed: ParsedDesktopVoiceServiceCommand,
  io: CliIo,
  dependencies: CliDependencies,
): Promise<number> {
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
): Promise<Awaited<ReturnType<typeof runPiServiceRuntime>>> {
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
): Promise<Awaited<ReturnType<typeof runDesktopVoiceServiceRuntime>>> {
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
