import { access, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDesktopVoiceRuntime } from "./desktop-voice-runtime.js";
import {
  createDesktopVoiceCommand,
  createDesktopVoiceConfig,
  withoutDesktopSpeechToText,
} from "../../test-support/desktop-voice-runtime.js";
import { deterministicScenarios } from "../../test-support/deterministic-scenarios.js";
import { withVoiceAdapterId } from "../../test-support/runtime-composition.js";

describe("desktop voice runtime", () => {
  it("runs one turn with the committed desktop voice demo config", async () => {
    const runtime = await createDesktopVoiceRuntime({
      configPath: fileURLToPath(
        new URL("../../../config/desktop-voice-demo.json", import.meta.url),
      ),
    });

    await expect(runtime.runOnce()).resolves.toMatchObject({
      response: deterministicScenarios.alarmListEmpty.response,
      status: "spoken",
      transcript: deterministicScenarios.alarmListEmpty.text,
      wakePhrase: "hey jarvis",
    });
  });

  it("runs one configured desktop voice turn through the assistant core", async () => {
    const runtime = await createDesktopVoiceRuntime({
      config: createDesktopVoiceConfig(
        deterministicScenarios.alarmListEmpty.text,
      ),
    });

    await expect(runtime.runOnce()).resolves.toEqual({
      response: deterministicScenarios.alarmListEmpty.response,
      spokenText: deterministicScenarios.alarmListEmpty.response.text,
      status: "spoken",
      textOutputWritten: false,
      transcript: deterministicScenarios.alarmListEmpty.text,
      wakePhrase: "hey jarvis",
    });
  });

  it("cleans up desktop voice temp files after a turn", async () => {
    const markerDirectory = await mkdtemp(
      join(tmpdir(), "personal-ai-speech-marker-"),
    );
    const markerPath = join(markerDirectory, "speech-path.txt");
    const runtime = await createDesktopVoiceRuntime({
      config: createDesktopVoiceConfig(
        deterministicScenarios.alarmListEmpty.text,
        {
          desktopVoice: {
            audioOutput: createDesktopVoiceCommand(
              'printf \'%s\' "$1" > "$2"',
              "{input}",
              markerPath,
            ),
          },
        },
      ),
    });

    await runtime.runOnce();

    const speechPath = await readFile(markerPath, "utf8");
    await expect(access(speechPath)).rejects.toThrow();
  });

  it("rejects missing desktop voice command settings during composition", async () => {
    const config = withoutDesktopSpeechToText(
      createDesktopVoiceConfig(deterministicScenarios.alarmListEmpty.text),
    );

    await expect(createDesktopVoiceRuntime({ config })).rejects.toThrow(
      "Config desktopVoice.speechToText must be configured.",
    );
  });

  it("rejects unregistered desktop voice adapter IDs during composition", async () => {
    await expect(
      createDesktopVoiceRuntime({
        config: withVoiceAdapterId(
          "speechToText",
          "unknown",
          createDesktopVoiceConfig(deterministicScenarios.alarmListEmpty.text),
        ),
      }),
    ).rejects.toThrow('Config voice.speechToText "unknown" is not registered.');
  });
});
