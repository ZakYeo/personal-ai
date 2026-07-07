import type { createConfiguredTextRuntime } from "../configured-text-runtime.js";
import type { ServiceProcessSignals } from "../service/service-runtime.js";
import type { ConfiguredVoiceServiceRuntimeOptions } from "../voice/configured-voice-service-runtime.js";
import type { createMockVoiceRuntime } from "../voice/mock-voice-runtime.js";
import type {
  ParsedAskCommand,
  ParsedVoiceCommand,
  ParsedVoiceServiceCommand,
} from "./command-parser.js";
import type { CliDependencies, CliIo } from "./types.js";

export function buildRuntimeOptions(
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

export function buildVoiceRuntimeOptions(
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

export function buildVoiceServiceRuntimeOptions(
  parsed: ParsedVoiceServiceCommand,
  env: NodeJS.ProcessEnv,
  io: CliIo,
  dependencies: CliDependencies,
): ConfiguredVoiceServiceRuntimeOptions {
  const fixedNow = env.PERSONAL_AI_FIXED_NOW;

  return {
    configPath: parsed.configPath,
    env,
    io: {
      fallbackOutput: io.stdout,
      progressOutput: io.stdout,
      stderr: io.stderr,
    },
    ...(fixedNow ? { now: () => new Date(fixedNow) } : {}),
    processSignals:
      dependencies.processSignals ?? createNodeProcessSignals(process),
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
