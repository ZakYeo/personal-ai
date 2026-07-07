import type { VoiceCommandConfig } from "../../ports/assistant.js";
import { runCommand } from "../../adapters/desktop/process-runner.js";
import type { ResolvedDesktopVoiceServiceConfig } from "../config/desktop-voice-config.js";
import type { ResolvedVoiceConfig } from "../config/voice-config.js";

const localOpenWakeWordListener = "scripts/openwakeword-listener.py";
const startupCheckTimeoutMs = 5000;

export async function validateOpenWakeWordStartup(
  voiceConfig: ResolvedVoiceConfig,
  desktopVoiceConfig: ResolvedDesktopVoiceServiceConfig,
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
      args: ["-c", "import openwakeword.model"],
      command: wakeActivation.command,
      timeoutMs: startupCheckTimeoutMs,
    });
  } catch {
    throw new Error(
      `OpenWakeWord startup check failed for desktopVoice.wakeActivation command "${wakeActivation.command}". Create a Python virtual environment, install openwakeword, and configure desktopVoice.wakeActivation.command to the venv Python interpreter, for example ".venv/bin/python".`,
    );
  }
}

function usesLocalOpenWakeWordListener(config: VoiceCommandConfig): boolean {
  return (config.args ?? []).includes(localOpenWakeWordListener);
}
