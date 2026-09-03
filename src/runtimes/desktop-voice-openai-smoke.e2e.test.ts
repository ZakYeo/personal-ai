import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { env, stdout } from "node:process";
import { dirname, join, resolve } from "node:path";

import { CommandStreamingAudioInput } from "../adapters/desktop/desktop-streaming-voice-adapters.js";
import { createFileAlarmStore } from "../adapters/local/file-alarm-store.js";
import { isRecord } from "../adapters/parsing.js";
import {
  createFileFedCommandStreamConfig,
  createFileFedDesktopVoiceOpenAISmokeConfig,
} from "../test-support/desktop-voice-openai-smoke.js";
import { createCapturedWriter, line } from "../test-support/primitives.js";
import { createServiceSignalController } from "../test-support/service-runtime.js";
import { loadConfig, parseAssistantConfig } from "./config/config.js";
import type { ServiceRuntimeResult } from "./service/service-runtime.js";
import { createDesktopVoiceServiceAdapters } from "./voice/desktop-voice-adapter-registry.js";
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
const alarmCommandFixturePath = join(
  "benchmarks",
  "voice",
  "corpus",
  "personal",
  "alarm-create-once-v1.wav",
);
const confirmationFixturePath = join(
  "benchmarks",
  "voice",
  "corpus",
  "personal",
  "confirmation-yes-v1.wav",
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

      const result = await runDesktopVoiceServiceRuntime({
        config,
        configDirectory: resolve(dirname(desktopVoiceOpenAIConfigPath)),
        env: { [openAIApiKeyEnv]: env[openAIApiKeyEnv] },
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
          expect.stringMatching(
            /^Assistant: (?=.*\balarms?\b)(?=.*(?:\bno\b|don't|don’t)).*\n$/iu,
          ),
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

    it("captures a confirmation reply without requiring another wake phrase and persists the alarm", async () => {
      const smokeDirectory = await mkdtemp(
        join(tmpdir(), "personal-ai-voice-confirmation-smoke-"),
      );
      const statePath = join(smokeDirectory, "alarms.json");
      const signals = createServiceSignalController();
      const progressOutput = createCapturedWriter();
      const fallbackOutput = createCapturedWriter();
      const stderr = createCapturedWriter();
      let captureIndex = 0;

      try {
        const config = await createVoiceConfirmationSmokeConfig(statePath);
        const commandFixtures = [
          alarmCommandFixturePath,
          confirmationFixturePath,
        ];
        const result = await runDesktopVoiceServiceRuntime({
          config,
          configDirectory: smokeDirectory,
          createVoiceAdapters: (voice, desktopVoice, dependencies) => {
            const adapters = createDesktopVoiceServiceAdapters(
              voice,
              desktopVoice,
              dependencies,
            );
            if (!adapters.streamingInput) {
              throw new Error(
                "Desktop voice confirmation smoke requires streaming input.",
              );
            }
            return {
              ...adapters,
              streamingInput: {
                ...adapters.streamingInput,
                audioInput: {
                  captureStream: () => {
                    const fixture = commandFixtures[captureIndex++];
                    if (!fixture) {
                      throw new Error(
                        "Desktop voice confirmation smoke exhausted its command fixtures.",
                      );
                    }
                    return new CommandStreamingAudioInput(
                      createFileFedCommandStreamConfig(config, fixture),
                      dependencies.processControl,
                      dependencies.shutdownSignal,
                      dependencies.env,
                    ).captureStream();
                  },
                },
              },
            };
          },
          env: { [openAIApiKeyEnv]: env[openAIApiKeyEnv] },
          io: { fallbackOutput, progressOutput, stderr },
          now: () => new Date("2026-06-26T09:00:00.000Z"),
          processSignals: signals,
          retryAfterFailure: (context) => {
            context.requestShutdown("smoke failure");
            return Promise.resolve();
          },
          runVoiceActivation: async (dependencies, io) => {
            const activationResult = await runVoiceActivation(dependencies, io);
            signals.emit("SIGTERM");
            return activationResult;
          },
        });

        expectSuccessfulSmokeResult(result, {
          progress: progressOutput.writes,
          stderr: stderr.writes,
        });
        expect(
          captureIndex,
          `Unexpected voice capture sequence:\n${progressOutput.writes.join("")}`,
        ).toBe(2);
        expect(progressOutput.writes).toEqual(
          expect.arrayContaining([
            line("Listening for your reply..."),
            expect.stringMatching(/^Assistant: Please confirm:/u),
            expect.stringMatching(/^Assistant: Alarm set for /u),
          ]),
        );
        expect(
          progressOutput.writes.filter((entry) =>
            entry.startsWith("Now listening for wake word"),
          ),
        ).toHaveLength(1);
        expect(fallbackOutput.writes).toEqual([]);
        expect(stderr.writes).toEqual([]);
        await expect(
          createFileAlarmStore({
            filePath: statePath,
            now: () => new Date("2026-06-26T09:00:00.000Z"),
          }).list(),
        ).resolves.toEqual([
          expect.objectContaining({
            label: "tea",
            scheduledFor: "2026-06-26T09:10:00.000Z",
          }),
        ]);
      } finally {
        signals.emit("SIGTERM");
        await rm(smokeDirectory, { force: true, recursive: true });
      }
    }, 60_000);
  },
);

async function createVoiceConfirmationSmokeConfig(statePath: string) {
  const raw: unknown = JSON.parse(
    await readFile(desktopVoiceOpenAIConfigPath, "utf8"),
  );
  if (!isRecord(raw)) {
    throw new Error("Desktop voice smoke config must be an object.");
  }
  const config = parseAssistantConfig({
    ...raw,
    conversation: { provider: "disabled" },
    features: {
      alarms: {
        adapter: "file",
        confirmationRequiredCapabilities: ["alarm.create"],
        enabled: true,
        state: { path: statePath },
      },
    },
    responseRewriter: { provider: "disabled" },
  });
  return createFileFedDesktopVoiceOpenAISmokeConfig(config, {
    commandPcm: alarmCommandFixturePath,
    wakeWav: wakeFixturePath,
  });
}

function printSmokeTimings(timings: VoiceTurnTimings): void {
  stdout.write(`${formatVoiceTimings(timings).join("\n")}\n`);
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
