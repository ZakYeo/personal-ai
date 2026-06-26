#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDeterministicRuntime } from "../deterministic-runtime.js";
import type { AssistantResponse } from "../../ports/assistant.js";

interface CliIo {
  env: NodeJS.ProcessEnv;
  stderr: Pick<NodeJS.WriteStream, "write">;
  stdout: Pick<NodeJS.WriteStream, "write">;
}

interface ParsedAskCommand {
  commandText: string;
  configPath?: string;
}

export async function main(
  args: string[] = process.argv.slice(2),
  io: CliIo = {
    env: process.env,
    stderr: process.stderr,
    stdout: process.stdout,
  },
): Promise<number> {
  const parsed = parseAskCommand(args);

  if (!parsed) {
    io.stderr.write(`${usage()}\n`);
    return 1;
  }

  const response = await handleRuntimeCommand(parsed, io);

  io.stdout.write(`${response.text}\n`);
  return response.status === "error" ? 1 : 0;
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  void main().then(
    (exitCode) => {
      process.exitCode = exitCode;
    },
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`${message}\n`);
      process.exitCode = 1;
    },
  );
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
): Promise<AssistantResponse> {
  try {
    const runtime = await createDeterministicRuntime(
      buildRuntimeOptions(parsed, io.env),
    );

    return await runtime.handleText(parsed.commandText);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    io.stderr.write(`Runtime failure: ${message}\n`);

    return {
      status: "error",
      text: "I hit a problem and could not complete that.",
    };
  }
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
