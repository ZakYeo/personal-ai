import type { Assistant } from "../core/assistant/index.js";
import type {
  AssistantDiagnostic,
  AssistantResponse,
} from "../ports/assistant.js";
import { main } from "../runtimes/cli/main.js";
import { line, writeTempJsonFile } from "./primitives.js";

type CliIo = NonNullable<Parameters<typeof main>[1]>;

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

interface InjectedRuntimeRunOptions {
  args: string[];
  env?: NodeJS.ProcessEnv;
  runtime: Assistant;
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
  return writeTempJsonFile(config, "personal-ai-cli-");
}

export async function runCliWithInjectedRuntime(
  options: InjectedRuntimeRunOptions,
): Promise<CliRunResult> {
  const { io, stdout, stderr } = createCliIo(options.env);
  const exitCode = await main(options.args, io, {
    createRuntime: () => Promise.resolve(options.runtime),
  });

  return {
    exitCode,
    stderr,
    stdout,
  };
}

export function createRuntimeStub(options: {
  diagnostics?: AssistantDiagnostic[];
  legacyResponse?: AssistantResponse;
  response: AssistantResponse;
}): Assistant {
  return {
    handleText: () =>
      Promise.resolve(
        options.legacyResponse ?? {
          status: "error",
          text: "legacy path should not be used",
        },
      ),
    handleTextWithDiagnostics: () =>
      Promise.resolve({
        response: options.response,
        ...(options.diagnostics ? { diagnostics: options.diagnostics } : {}),
      }),
  };
}

export function cliResult(
  exitCode: number,
  stdout: string[] = [],
  stderr: string[] = [],
): CliRunResult {
  return {
    exitCode,
    stderr,
    stdout,
  };
}

export function stdoutLine(text: string): string[] {
  return [line(text)];
}

export function stderrLine(text: string): string[] {
  return [line(text)];
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
