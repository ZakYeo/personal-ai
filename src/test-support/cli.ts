import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main } from "../runtimes/cli/main.js";

type CliIo = Parameters<typeof main>[1];

interface CapturedCliIo {
  io: CliIo;
  stderr: string[];
  stdout: string[];
}

interface CliRunResult {
  exitCode: number;
  stderr: string[];
  stdout: string[];
}

export function createCliIo(env: NodeJS.ProcessEnv = {}): CapturedCliIo {
  const stdout: string[] = [];
  const stderr: string[] = [];

  return {
    io: {
      env,
      stdout: createWriter(stdout),
      stderr: createWriter(stderr),
    },
    stdout,
    stderr,
  };
}

export async function runCli(
  args: string[],
  env: NodeJS.ProcessEnv = {},
): Promise<CliRunResult> {
  const { io, stdout, stderr } = createCliIo(env);
  const exitCode = await main(args, io);

  return {
    exitCode,
    stderr,
    stdout,
  };
}

export async function runAsk(options: {
  config?: unknown;
  configPath?: string;
  env?: NodeJS.ProcessEnv;
  text: string;
}): Promise<CliRunResult> {
  const configPath = options.configPath ?? (await writeOptionalConfig(options));

  return runCli(
    ["ask", ...(configPath ? ["--config", configPath] : []), options.text],
    options.env,
  );
}

export async function writeTempConfig(config: unknown): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "personal-ai-cli-"));
  const configPath = join(directory, "config.json");

  await writeFile(configPath, JSON.stringify(config));

  return configPath;
}

function createWriter(writes: string[]): Pick<NodeJS.WriteStream, "write"> {
  return {
    write: (chunk: string | Uint8Array) => {
      writes.push(String(chunk));
      return true;
    },
  };
}

async function writeOptionalConfig(options: {
  config?: unknown;
}): Promise<string | undefined> {
  if (options.config === undefined) {
    return undefined;
  }

  return writeTempConfig(options.config);
}
