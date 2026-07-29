import type { Assistant } from "../../core/assistant/index.js";
import type { AssistantResponse } from "../../ports/assistant.js";
import { createConfiguredTextRuntime } from "../configured-text-runtime.js";
import {
  logAssistantDiagnostics,
  logRuntimeFailure,
  safeRuntimeFallbackResponse,
} from "../human-boundary.js";
import { runPiServiceRuntime } from "../pi/pi-service-runtime.js";
import { runDesktopVoiceServiceRuntime } from "../voice/desktop-voice-service-runtime.js";
import { createDesktopVoiceRuntime } from "../voice/desktop-voice-runtime.js";
import { createMockVoiceRuntime } from "../voice/mock-voice-runtime.js";
import type {
  ParsedAskCommand,
  ParsedDesktopVoiceServiceCommand,
  ParsedPiServiceCommand,
  ParsedVoiceCommand,
} from "./command-parser.js";
import {
  buildRuntimeOptions,
  buildVoiceRuntimeOptions,
  buildVoiceServiceRuntimeOptions,
} from "./runtime-options.js";
import type { CliDependencies, CliIo } from "./types.js";
import { renderAssistantResponseText } from "../assistant-response-rendering.js";

export async function runAskCommand(
  parsed: ParsedAskCommand,
  io: CliIo,
  dependencies: CliDependencies,
): Promise<number> {
  const response = await handleRuntimeCommand(parsed, io, dependencies);

  writeAssistantResponse(io, response);
  return response.status === "error" ? 1 : 0;
}

export async function runVoiceCommand(
  parsed: ParsedVoiceCommand,
  io: CliIo,
  dependencies: CliDependencies,
): Promise<number> {
  const result = await handleVoiceCommand(parsed, io, dependencies);

  if (!result.outputWritten) {
    writeAssistantResponse(io, result.response);
  }

  return result.response.status === "error" ? 1 : 0;
}

export async function runPiServiceCommand(
  parsed: ParsedPiServiceCommand,
  io: CliIo,
  dependencies: CliDependencies,
): Promise<number> {
  const result = await handlePiServiceCommand(parsed, io, dependencies);

  if (result.status !== "stopped") {
    writeAssistantResponse(io, result.response);
    return 1;
  }

  return 0;
}

export async function runDesktopVoiceServiceCommand(
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
    writeAssistantResponse(io, result.response);
    return 1;
  }

  return 0;
}

function writeAssistantResponse(io: CliIo, response: AssistantResponse): void {
  io.stdout.write(
    `${renderAssistantResponseText(response, {
      hyperlinks: io.supportsHyperlinks === true,
    })}\n`,
  );
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

    logAssistantDiagnostics(outcome.diagnostics ?? [], io);

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
      buildVoiceServiceRuntimeOptions(parsed, io.env, io, dependencies),
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
      buildVoiceServiceRuntimeOptions(parsed, io.env, io, dependencies),
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
