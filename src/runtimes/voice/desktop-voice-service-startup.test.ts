import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createOpenWakeWordServiceConfig } from "../../test-support/desktop-voice-service.js";
import {
  createDesktopVoiceConfig,
  withoutDesktopWakeAudioInput,
} from "../../test-support/desktop-voice-runtime.js";
import { deterministicScenarios } from "../../test-support/deterministic-scenarios.js";
import { createCapturedWriter, line } from "../../test-support/primitives.js";
import { safeRuntimeFallbackResponse } from "../human-boundary.js";
import { runDesktopVoiceServiceRuntime } from "./desktop-voice-service-runtime.js";

describe("desktop voice service startup", () => {
  it("returns a safe startup failure outcome when wake audio config is missing", async () => {
    const stderr = createCapturedWriter();

    await expect(
      runDesktopVoiceServiceRuntime({
        config: withoutDesktopWakeAudioInput(
          createDesktopVoiceConfig(deterministicScenarios.alarmListEmpty.text),
        ),
        io: { stderr },
        retryAfterFailure: () => Promise.resolve(),
        runVoiceActivation: () => {
          throw new Error("should not run");
        },
      }),
    ).resolves.toEqual({
      response: safeRuntimeFallbackResponse,
      status: "startup_failed",
      turnsCompleted: 0,
    });

    expect(stderr.writes).toContain(
      line(
        "Runtime failure: Config desktopVoice.wakeAudioInput must be configured.",
      ),
    );
  });

  it("returns a safe startup failure outcome when streaming transcription config is partial", async () => {
    const stderr = createCapturedWriter();

    await expect(
      runDesktopVoiceServiceRuntime({
        config: createDesktopVoiceConfig(
          deterministicScenarios.alarmListEmpty.text,
          {
            voice: {
              streamingAudioInput: "sox-rec-stream",
            },
          },
        ),
        io: { stderr },
        retryAfterFailure: () => Promise.resolve(),
        runVoiceActivation: () => {
          throw new Error("should not run");
        },
      }),
    ).resolves.toEqual({
      response: safeRuntimeFallbackResponse,
      status: "startup_failed",
      turnsCompleted: 0,
    });

    expect(stderr.writes).toContain(
      line(
        "Runtime failure: Config voice.streamingAudioInput and voice.streamingSpeechToText must be configured together.",
      ),
    );
  });

  it("fails startup once with OpenWakeWord setup guidance when the local Python listener dependency is missing", async () => {
    const stderr = createCapturedWriter();
    const runVoiceActivation = vi.fn();

    await expect(
      runDesktopVoiceServiceRuntime({
        config: createOpenWakeWordServiceConfig("/bin/false", [
          "scripts/openwakeword-listener.py",
        ]),
        io: { stderr },
        retryAfterFailure: () => Promise.resolve(),
        runVoiceActivation,
      }),
    ).resolves.toEqual({
      response: safeRuntimeFallbackResponse,
      status: "startup_failed",
      turnsCompleted: 0,
    });

    expect(runVoiceActivation).not.toHaveBeenCalled();
    expect(stderr.writes).toEqual([
      line(
        'Runtime failure: OpenWakeWord startup check failed for desktopVoice.wakeActivation command "/bin/false". Create a Python virtual environment, install openwakeword, and configure desktopVoice.wakeActivation.command to the venv Python interpreter, for example ".venv/bin/python".',
      ),
    ]);
  });

  it("fails startup once when the local OpenWakeWord listener startup check fails", async () => {
    const directory = await mkdtemp(join(tmpdir(), "personal-ai-oww-"));
    const command = join(directory, "python");
    await writeFile(
      command,
      [
        "#!/usr/bin/env sh",
        'if [ "$1" = "-c" ]; then',
        "  exit 0",
        "fi",
        'for arg in "$@"; do',
        '  if [ "$arg" = "--startup-check" ]; then',
        "    echo 'listener constructor failed' >&2",
        "    exit 1",
        "  fi",
        "done",
        'printf \'%s\\n\' \'{"type":"wake","phrase":"hey jarvis"}\'',
      ].join("\n"),
    );
    await chmod(command, 0o755);

    const stderr = createCapturedWriter();
    const runVoiceActivation = vi.fn();

    await expect(
      runDesktopVoiceServiceRuntime({
        config: createOpenWakeWordServiceConfig(command, [
          "scripts/openwakeword-listener.py",
          "--model",
          "hey jarvis",
        ]),
        io: { stderr },
        retryAfterFailure: () => Promise.resolve(),
        runVoiceActivation,
      }),
    ).resolves.toEqual({
      response: safeRuntimeFallbackResponse,
      status: "startup_failed",
      turnsCompleted: 0,
    });

    expect(runVoiceActivation).not.toHaveBeenCalled();
    expect(stderr.writes).toEqual([
      line(
        `Runtime failure: OpenWakeWord startup check failed for desktopVoice.wakeActivation command "${command}". Create a Python virtual environment, install openwakeword, and configure desktopVoice.wakeActivation.command to the venv Python interpreter, for example ".venv/bin/python".`,
      ),
    ]);
  });
});
