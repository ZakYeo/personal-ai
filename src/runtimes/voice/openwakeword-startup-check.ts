import { basename } from "node:path";
import {
  resolveDesktopCommandEnvironment,
  type DesktopCommandConfig,
} from "../../adapters/desktop/desktop-command-config.js";
import { runCommand } from "../../adapters/desktop/process-runner.js";
import type { ResolvedDesktopVoiceServiceAdapterConfig } from "./desktop-voice-adapter-types.js";
import type { ResolvedVoiceConfig } from "../config/voice-config.js";

const localOpenWakeWordListener = "openwakeword-listener.py";
const startupCheckTimeoutMs = 5000;

export async function validateOpenWakeWordStartup(
  voiceConfig: ResolvedVoiceConfig,
  desktopVoiceConfig: ResolvedDesktopVoiceServiceAdapterConfig,
  environment: Record<string, string | undefined> = {},
): Promise<void> {
  if (voiceConfig.wakeActivation !== "openwakeword-command") {
    return;
  }

  const wakeActivation = desktopVoiceConfig.wakeActivation;
  if (!wakeActivation || !usesLocalOpenWakeWordListener(wakeActivation)) {
    return;
  }

  try {
    await runCommand({
      args: [...(wakeActivation.args ?? []), "--startup-check"],
      command: wakeActivation.command,
      environment: resolveDesktopCommandEnvironment(
        wakeActivation,
        environment,
      ),
      timeoutMs: startupCheckTimeoutMs,
    });
  } catch {
    throw new Error(
      `OpenWakeWord startup check failed for desktopVoice.wakeActivation command "${wakeActivation.command}". Create a Python virtual environment, install openwakeword, and configure desktopVoice.wakeActivation.command to the venv Python interpreter, for example ".venv/bin/python".`,
    );
  }
}

function usesLocalOpenWakeWordListener(config: DesktopCommandConfig): boolean {
  return (config.args ?? []).some(
    (argument) => basename(argument) === localOpenWakeWordListener,
  );
}
