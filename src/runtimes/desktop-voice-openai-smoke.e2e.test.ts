import { env, stdout } from "node:process";
import { join } from "node:path";

import { createFileFedDesktopVoiceOpenAISmokeConfig } from "../test-support/desktop-voice-openai-smoke.js";
import { createCapturedWriter, line } from "../test-support/primitives.js";
import { createServiceSignalController } from "../test-support/service-runtime.js";
import { loadConfig } from "./config/config.js";
import type { ServiceRuntimeResult } from "./service/service-runtime.js";
import { runDesktopVoiceServiceRuntime } from "./voice/desktop-voice-service-runtime.js";
import { runVoiceActivation } from "./voice/voice-activation.js";
import {
  formatVoiceTimings,
  type VoiceTurnTimings,
} from "./voice/voice-timings.js";

const runDesktopVoiceOpenAISmoke =
  env.PERSONAL_AI_RUN_DESKTOP_VOICE_OPENAI_SMOKE === "1";
const openAIApiKeyEnv = "OPENAI_API_KEY";
const audioFixtureDirectory = join("test", "fixtures", "audio");
const wakeFixturePath = join(audioFixtureDirectory, "hey-jarvis.wav");
const commandFixturePath = join(
  audioFixtureDirectory,
  "list-my-alarms-24khz-mono-s16le.pcm",
);
const desktopVoiceOpenAIConfigPath = join(
  "config",
  "local-desktop-voice-openai.json",
);

describe.skipIf(!runDesktopVoiceOpenAISmoke)(
  "desktop voice OpenAI smoke",
  () => {
    beforeAll(() => {
      if (!env[openAIApiKeyEnv]) {
        throw new Error(
          `${openAIApiKeyEnv} must be set to run the desktop voice OpenAI smoke test.`,
        );
      }
    });

    it("detects a file-fed wake phrase and transcribes a file-fed command through the desktop voice service", async () => {
      const signals = createServiceSignalController();
      const progressOutput = createCapturedWriter();
      const fallbackOutput = createCapturedWriter();
      const stderr = createCapturedWriter();
      let smokeTimings: VoiceTurnTimings | undefined;
      const config = createFileFedDesktopVoiceOpenAISmokeConfig(
        await loadConfig({ configPath: desktopVoiceOpenAIConfigPath }),
        {
          commandPcm: commandFixturePath,
          wakeWav: wakeFixturePath,
        },
      );

      const fetch = createSmokeFetch();

      const result = await runDesktopVoiceServiceRuntime({
        config,
        env: { [openAIApiKeyEnv]: env[openAIApiKeyEnv] },
        fetch,
        io: { fallbackOutput, progressOutput, stderr },
        now: () => new Date("2026-06-26T09:00:00.000Z"),
        processSignals: signals,
        retryAfterFailure: (context) => {
          context.requestShutdown("smoke failure");

          return Promise.resolve();
        },
        runVoiceActivation: async (dependencies, io) => {
          const activationResult = await runVoiceActivation(
            {
              ...dependencies,
              timing: {},
            },
            io,
          );
          smokeTimings = activationResult.timings;
          signals.emit("SIGTERM");

          return activationResult;
        },
      });

      expectSuccessfulSmokeResult(result, {
        progress: progressOutput.writes,
        stderr: stderr.writes,
      });

      expect(result).toEqual({
        status: "stopped",
        turnsCompleted: 1,
      });

      expect(progressOutput.writes).toEqual(
        expect.arrayContaining([
          line('Now listening for wake word "hey jarvis".'),
          line("Wake word detected, now listening..."),
          line("Assistant: There are no alarms set."),
        ]),
      );
      expect(progressOutput.writes.join("")).toMatch(
        /Heard: .*list my alarms/i,
      );
      expect(fallbackOutput.writes).toEqual([]);
      expect(stderr.writes).toEqual([]);
      if (!smokeTimings) {
        throw new Error("Desktop voice OpenAI smoke did not capture timings.");
      }

      expect(smokeTimings.phases.map((phase) => phase.name)).toEqual(
        expect.arrayContaining([
          "wake activation",
          "command stream setup",
          "command transcription",
          "assistant handling",
          "speech output",
        ]),
      );
      expect(Number.isFinite(smokeTimings.totalMs)).toBe(true);
      printSmokeTimings(smokeTimings);
    }, 60_000);
  },
);

function printSmokeTimings(timings: VoiceTurnTimings): void {
  stdout.write(`${formatVoiceTimings(timings).join("\n")}\n`);
}

function createSmokeFetch(): typeof globalThis.fetch {
  return (input) => {
    const url = requestUrl(input);

    if (url.endsWith("/responses")) {
      return Promise.resolve(
        Response.json({
          output_text: JSON.stringify({
            command: {
              capability: "alarm.list",
              parameters: [],
              rawText: "List my alarms.",
            },
            kind: "command",
            response: null,
          }),
        }),
      );
    }

    if (url.endsWith("/audio/speech")) {
      return Promise.resolve(new Response(Buffer.from("spoken audio")));
    }

    return Promise.reject(new Error(`Unexpected smoke fetch URL: ${url}`));
  };
}

function requestUrl(input: Parameters<typeof globalThis.fetch>[0]): string {
  if (typeof input === "string") {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  return input.url;
}

function expectSuccessfulSmokeResult(
  result: ServiceRuntimeResult,
  output: { progress: string[]; stderr: string[] },
): void {
  if (result.status === "stopped" && result.turnsCompleted === 1) {
    return;
  }

  throw new Error(
    [
      "Desktop voice OpenAI smoke did not complete one turn.",
      `Result: ${JSON.stringify(result)}`,
      `Progress output:\n${output.progress.join("")}`,
      `Stderr output:\n${output.stderr.join("")}`,
    ].join("\n\n"),
  );
}
