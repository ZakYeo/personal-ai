import type { runDesktopVoiceServiceRuntime } from "../voice/desktop-voice-service-runtime.js";
import type { createDesktopVoiceRuntime } from "../voice/desktop-voice-runtime.js";
import type { createMockVoiceRuntime } from "../voice/mock-voice-runtime.js";
import type { runPiServiceRuntime } from "../pi/pi-service-runtime.js";
import type { createConfiguredTextRuntime } from "../configured-text-runtime.js";
import type { ServiceProcessSignals } from "../service/service-runtime.js";

export interface CliIo {
  env: NodeJS.ProcessEnv;
  stderr: Pick<NodeJS.WriteStream, "write">;
  stdout: Pick<NodeJS.WriteStream, "write">;
}

export interface CliDependencies {
  createDesktopVoiceServiceRuntime?: typeof runDesktopVoiceServiceRuntime;
  createDesktopVoiceRuntime?: typeof createDesktopVoiceRuntime;
  createPiServiceRuntime?: typeof runPiServiceRuntime;
  createRuntime?: typeof createConfiguredTextRuntime;
  createVoiceRuntime?: typeof createMockVoiceRuntime;
  processSignals?: ServiceProcessSignals;
}

export interface ProcessState {
  exitCode?: NodeJS.Process["exitCode"];
}
