import { main, runCliEntryPoint } from "./main.js";
import {
  cliResult,
  createCliIo,
  createRuntimeStub,
  runAsk,
  runCli,
  runCliWithInjectedRuntime,
  stderrLine,
  stdoutLine,
  writeTempConfig,
} from "../../test-support/cli.js";
import { deterministicScenarios } from "../../test-support/deterministic-scenarios.js";
import {
  deterministicNowIso,
  disabledCalendarConfig,
  enabledDeterministicConfig,
  mockVoiceConfig,
  runtimeFailureConfig,
  runtimeFailureDiagnostic,
  runtimeFailureResponse,
  voiceEnabledDeterministicConfig,
} from "../../test-support/deterministic-runtime-fixtures.js";
import {
  createDesktopVoiceConfig,
  withDesktopSpeechToTextFailure,
  withoutDesktopAudioInput,
  withoutDesktopSpeechToText,
} from "../../test-support/desktop-voice-runtime.js";
import { withVoiceAdapterId } from "../../test-support/runtime-composition.js";
import { safeRuntimeFallbackResponse } from "../human-boundary.js";

describe("personal-ai ask CLI", () => {
  it("prints the calendar response", async () => {
    await expect(
      runAsk({
        env: { PERSONAL_AI_FIXED_NOW: deterministicNowIso },
        text: deterministicScenarios.calendarWedding.text,
      }),
    ).resolves.toEqual(
      cliResult(
        0,
        stdoutLine(deterministicScenarios.calendarWedding.response.text),
      ),
    );
  });

  it("smoke-prints upcoming calendar events through the mock calendar", async () => {
    await expect(
      runAsk({
        env: { PERSONAL_AI_FIXED_NOW: deterministicNowIso },
        text: deterministicScenarios.calendarUpcomingEvents.text,
      }),
    ).resolves.toEqual(
      cliResult(
        0,
        stdoutLine(deterministicScenarios.calendarUpcomingEvents.response.text),
      ),
    );
  });

  it("prints the messaging draft response", async () => {
    await expect(
      runAsk({ text: deterministicScenarios.messagingWhatsappDraft.text }),
    ).resolves.toMatchObject({
      exitCode: 0,
      stdout: [
        `${deterministicScenarios.messagingWhatsappDraft.response.text}\n`,
      ],
    });
  });

  it("prints the alarm confirmation response with a fixed clock", async () => {
    await expect(
      runAsk({
        env: { PERSONAL_AI_FIXED_NOW: deterministicNowIso },
        text: deterministicScenarios.alarmCreateNeedsConfirmation.text,
      }),
    ).resolves.toMatchObject({
      exitCode: 0,
      stdout: [
        `${deterministicScenarios.alarmCreateNeedsConfirmation.response.text}\n`,
      ],
    });
  });

  it("runs one simulated voice turn with the default utterance", async () => {
    await expect(
      runCli(["voice-once"], { PERSONAL_AI_FIXED_NOW: deterministicNowIso }),
    ).resolves.toEqual({
      exitCode: 0,
      stdout: [`${deterministicScenarios.calendarWedding.response.text}\n`],
      stderr: [],
    });
  });

  it("runs one simulated voice turn with an explicit utterance and config", async () => {
    const configPath = await writeTempConfig(voiceEnabledDeterministicConfig);

    await expect(
      runCli(
        [
          "voice-once",
          "--config",
          configPath,
          "--utterance",
          deterministicScenarios.alarmCreateNeedsConfirmation.text,
        ],
        { PERSONAL_AI_FIXED_NOW: deterministicNowIso },
      ),
    ).resolves.toMatchObject({
      exitCode: 0,
      stdout: [
        `${deterministicScenarios.alarmCreateNeedsConfirmation.response.text}\n`,
      ],
      stderr: [],
    });
  });

  it("smoke-runs upcoming calendar events through mock voice and calendar", async () => {
    const configPath = await writeTempConfig(voiceEnabledDeterministicConfig);

    await expect(
      runCli(
        [
          "voice-once",
          "--config",
          configPath,
          "--utterance",
          deterministicScenarios.calendarUpcomingEvents.text,
        ],
        { PERSONAL_AI_FIXED_NOW: deterministicNowIso },
      ),
    ).resolves.toEqual({
      exitCode: 0,
      stdout: [
        `${deterministicScenarios.calendarUpcomingEvents.response.text}\n`,
      ],
      stderr: [],
    });
  });

  it("prints a deterministic ignored voice response without a wake phrase", async () => {
    await expect(
      runCli(["voice-once", "--utterance", "list my alarms"]),
    ).resolves.toEqual({
      exitCode: 0,
      stdout: ["Wake phrase not detected.\n"],
      stderr: [],
    });
  });

  it("runs one desktop voice turn with configured command adapters", async () => {
    const configPath = await writeTempConfig(
      createDesktopVoiceConfig(deterministicScenarios.alarmListEmpty.text),
    );

    await expect(
      runCli(["desktop-voice-once", "--config", configPath]),
    ).resolves.toEqual({
      exitCode: 0,
      stdout: [`${deterministicScenarios.alarmListEmpty.response.text}\n`],
      stderr: [],
    });
  });

  it("runs the Raspberry Pi service command with injected dependencies", async () => {
    const configPath = await writeTempConfig(
      createDesktopVoiceConfig(deterministicScenarios.alarmListEmpty.text),
    );
    const { io, stdout, stderr } = createCliIo({
      OPENAI_API_KEY: "test-api-key",
    });
    const assertOptions = createServiceOptionsAssertion(configPath, io);

    await expect(
      main(["pi-service", "--config", configPath], io, {
        createPiServiceRuntime: (options) => {
          assertOptions(options);

          return Promise.resolve({
            status: "stopped",
            turnsCompleted: 1,
          });
        },
      }),
    ).resolves.toBe(0);

    expect(stdout).toEqual([]);
    expect(stderr).toEqual([]);
  });

  it("runs the desktop voice service command with injected dependencies", async () => {
    const configPath = await writeTempConfig(
      createDesktopVoiceConfig(deterministicScenarios.alarmListEmpty.text),
    );
    const { io, stdout, stderr } = createCliIo({
      OPENAI_API_KEY: "test-api-key",
    });
    const assertOptions = createServiceOptionsAssertion(configPath, io);

    await expect(
      main(["desktop-voice-service", "--config", configPath], io, {
        createDesktopVoiceServiceRuntime: (options) => {
          assertOptions(options);

          return Promise.resolve({
            status: "stopped",
            turnsCompleted: 1,
          });
        },
      }),
    ).resolves.toBe(0);

    expect(stdout).toEqual([]);
    expect(stderr).toEqual([]);
  });

  it("prints a graceful response and diagnostics when Raspberry Pi service startup fails", async () => {
    const { io, stdout, stderr } = createCliIo();

    await expect(
      main(["pi-service", "--config", "pi-config.json"], io, {
        createPiServiceRuntime: () =>
          Promise.resolve({
            response: safeRuntimeFallbackResponse,
            status: "startup_failed",
            turnsCompleted: 0,
          }),
      }),
    ).resolves.toBe(1);

    expect(stdout).toEqual([`${safeRuntimeFallbackResponse.text}\n`]);
    expect(stderr).toEqual([]);
  });

  it("prints a graceful response and diagnostics when desktop voice service startup fails", async () => {
    const { io, stdout, stderr } = createCliIo();

    await expect(
      main(["desktop-voice-service", "--config", "desktop-config.json"], io, {
        createDesktopVoiceServiceRuntime: () =>
          Promise.resolve({
            response: safeRuntimeFallbackResponse,
            status: "startup_failed",
            turnsCompleted: 0,
          }),
      }),
    ).resolves.toBe(1);

    expect(stdout).toEqual([`${safeRuntimeFallbackResponse.text}\n`]);
    expect(stderr).toEqual([]);
  });

  it("prints a graceful response and diagnostics when desktop voice setup fails", async () => {
    const configPath = await writeTempConfig(
      withoutDesktopSpeechToText(
        createDesktopVoiceConfig(deterministicScenarios.alarmListEmpty.text),
      ),
    );

    await expect(
      runCli(["desktop-voice-once", "--config", configPath]),
    ).resolves.toEqual({
      exitCode: 1,
      stderr: [
        "Runtime failure: Config desktopVoice.speechToText must be configured.\n",
      ],
      stdout: ["I hit a problem and could not complete that.\n"],
    });
  });

  it("prints a graceful response and diagnostics when desktop audio command config is missing", async () => {
    const configPath = await writeTempConfig(
      withoutDesktopAudioInput(
        createDesktopVoiceConfig(deterministicScenarios.alarmListEmpty.text),
      ),
    );

    await expect(
      runCli(["desktop-voice-once", "--config", configPath]),
    ).resolves.toEqual({
      exitCode: 1,
      stderr: [
        "Runtime failure: Config desktopVoice.audioInput must be configured.\n",
      ],
      stdout: ["I hit a problem and could not complete that.\n"],
    });
  });

  it("logs desktop voice command stderr without exposing it in stdout", async () => {
    const configPath = await writeTempConfig(
      withDesktopSpeechToTextFailure(
        createDesktopVoiceConfig(deterministicScenarios.alarmListEmpty.text),
        "stt provider token failure",
        12,
      ),
    );

    await expect(
      runCli(["desktop-voice-once", "--config", configPath]),
    ).resolves.toEqual({
      exitCode: 1,
      stderr: [
        'Runtime failure: Command "/bin/sh" exited with code 12.\n',
        "Runtime failure stderr: stt provider token failure\n",
      ],
      stdout: ["I hit a problem and could not complete that.\n"],
    });
  });

  it("logs runtime provider diagnostics without exposing them in stdout", async () => {
    const providerError = Object.assign(new Error("OpenAI speech failed."), {
      responseBody: '{"error":"provider token secret"}',
      status: 429,
    });
    const result = await runCliWithInjectedRuntime({
      args: ["ask", "fail safely"],
      runtime: createRejectingDiagnosticRuntime(providerError),
    });

    expect(result).toMatchObject({
      exitCode: 1,
      stdout: stdoutLine("I hit a problem and could not complete that."),
    });
    expect(result.stdout.join("")).not.toContain("provider token secret");
    expect(result.stderr).toEqual([
      "Runtime failure: OpenAI speech failed.\n",
      "Runtime failure status: 429\n",
      'Runtime failure response body: {"error":"provider token secret"}\n',
    ]);
  });

  it("logs non-serializable runtime provider events without throwing", async () => {
    const event: Record<string, unknown> = { type: "error" };
    event.self = event;
    const providerError = Object.assign(new Error("Realtime failed."), {
      event,
    });
    const result = await runCliWithInjectedRuntime({
      args: ["ask", "fail safely"],
      runtime: createRejectingDiagnosticRuntime(providerError),
    });

    expect(result).toMatchObject({
      exitCode: 1,
      stdout: stdoutLine("I hit a problem and could not complete that."),
    });
    expect(result.stderr).toEqual([
      "Runtime failure: Realtime failed.\n",
      "Runtime failure event: [unserializable diagnostic]\n",
    ]);
  });

  it("prints a graceful response and diagnostics when voice setup fails", async () => {
    const configPath = await writeTempConfig(
      withVoiceAdapterId("speechToText", "unknown", {
        ...enabledDeterministicConfig,
        voice: mockVoiceConfig,
      }),
    );

    await expect(
      runCli(["voice-once", "--config", configPath]),
    ).resolves.toEqual({
      exitCode: 1,
      stderr: [
        'Runtime failure: Config voice.speechToText "unknown" is not registered.\n',
      ],
      stdout: ["I hit a problem and could not complete that.\n"],
    });
  });

  it("prints a graceful response and diagnostics when voice config is missing", async () => {
    const configPath = await writeTempConfig(enabledDeterministicConfig);

    await expect(
      runCli(["voice-once", "--config", configPath]),
    ).resolves.toEqual({
      exitCode: 1,
      stderr: ["Runtime failure: Config voice.input must be configured.\n"],
      stdout: ["I hit a problem and could not complete that.\n"],
    });
  });

  it("requires confirmation for high-risk alarms even when config omits confirmation requirements", async () => {
    await expect(
      runAsk({
        config: enabledDeterministicConfig,
        env: { PERSONAL_AI_FIXED_NOW: deterministicNowIso },
        text: deterministicScenarios.alarmCreateNeedsConfirmation.text,
      }),
    ).resolves.toMatchObject({
      exitCode: 0,
      stdout: [
        `${deterministicScenarios.alarmCreateNeedsConfirmation.response.text}\n`,
      ],
    });
  });

  it("prints the empty alarm list response", async () => {
    await expect(
      runAsk({ text: deterministicScenarios.alarmListEmpty.text }),
    ).resolves.toMatchObject({
      exitCode: 0,
      stdout: [`${deterministicScenarios.alarmListEmpty.response.text}\n`],
    });
  });

  it("does not persist in-memory alarms between separate CLI invocations", async () => {
    await expect(
      runAsk({
        env: { PERSONAL_AI_FIXED_NOW: deterministicNowIso },
        text: deterministicScenarios.alarmCreateNeedsConfirmation.text,
      }),
    ).resolves.toMatchObject({ exitCode: 0 });
    await expect(
      runAsk({
        env: { PERSONAL_AI_FIXED_NOW: deterministicNowIso },
        text: deterministicScenarios.alarmListEmpty.text,
      }),
    ).resolves.toMatchObject({
      exitCode: 0,
      stdout: [`${deterministicScenarios.alarmListEmpty.response.text}\n`],
    });
  });

  it("prints a deterministic unknown response", async () => {
    await expect(
      runAsk({ text: deterministicScenarios.unknown.text }),
    ).resolves.toMatchObject({
      exitCode: 0,
      stdout: [`${deterministicScenarios.unknown.response.text}\n`],
    });
  });

  it("prints a deterministic unknown response for a disabled feature command", async () => {
    await expect(
      runAsk({
        config: disabledCalendarConfig,
        text: deterministicScenarios.unsupportedCalendar.text,
      }),
    ).resolves.toMatchObject({
      exitCode: 0,
      stdout: [`${deterministicScenarios.unsupportedCalendar.response.text}\n`],
    });
  });

  it("returns usage for invalid input", async () => {
    await expect(runCli(["ask"])).resolves.toEqual({
      exitCode: 1,
      stdout: [],
      stderr: [
        'Usage: personal-ai ask [--config path/to/config.json] "command text"\n       personal-ai voice-once [--config path/to/config.json] [--utterance "spoken command"]\n       personal-ai desktop-voice-once [--config path/to/config.json]\n       personal-ai desktop-voice-service --config path/to/desktop-config.json\n       personal-ai pi-service --config path/to/pi-config.json\n',
      ],
    });
  });

  it("prints a graceful response and diagnostics when runtime setup fails", async () => {
    await expect(
      runAsk({
        config: runtimeFailureConfig,
        text: deterministicScenarios.alarmListEmpty.text,
      }),
    ).resolves.toEqual({
      exitCode: 1,
      stdout: [`${runtimeFailureResponse.text}\n`],
      stderr: [`${runtimeFailureDiagnostic}\n`],
    });
  });

  it("logs assistant diagnostics without exposing them in the response", async () => {
    const cause = new Error("provider token secret fixture failure");
    cause.stack =
      "Error: provider token secret fixture failure\n    at feature fixture";
    const result = await runCliWithInjectedRuntime({
      args: ["ask", "fail safely"],
      runtime: createRuntimeStub({
        response: {
          status: "error",
          text: "I could not complete that command.",
        },
        diagnostics: [
          {
            category: "feature_failure",
            capability: "test.echo",
            cause,
            message: "provider token secret fixture failure",
          },
        ],
      }),
    });

    expect(result).toMatchObject({
      exitCode: 1,
      stdout: stdoutLine("I could not complete that command."),
    });
    expect(result.stdout.join("")).not.toContain("provider token secret");
    expect(result.stderr).toHaveLength(2);
    expect(result.stderr[0]).toBe(
      "Feature failure in test.echo: provider token secret fixture failure\n",
    );
    expect(result.stderr[1]).toContain(
      "Feature failure cause in test.echo: Error: provider token secret fixture failure",
    );
    expect(result.stderr[1]).toContain("at feature fixture");
  });

  it("passes CLI environment into runtime composition", async () => {
    const { io, stdout, stderr } = createCliIo({
      OPENAI_API_KEY: "test-api-key",
    });

    await expect(
      main(["ask", "Hey Jarvis, list my alarms"], io, {
        createRuntime: (options) => {
          expect(options?.env?.OPENAI_API_KEY).toBe("test-api-key");

          return Promise.resolve({
            handleText: () =>
              Promise.resolve({
                status: "ok",
                text: "legacy path should not be used",
              }),
            handleTextWithDiagnostics: () =>
              Promise.resolve({
                response: deterministicScenarios.alarmListEmpty.response,
              }),
          });
        },
      }),
    ).resolves.toBe(0);
    expect(stdout).toEqual([
      `${deterministicScenarios.alarmListEmpty.response.text}\n`,
    ]);
    expect(stderr).toEqual([]);
  });

  it("passes CLI environment into voice runtime composition", async () => {
    const { io, stdout, stderr } = createCliIo({
      OPENAI_API_KEY: "test-api-key",
    });

    await expect(
      main(["voice-once"], io, {
        createVoiceRuntime: (options) => {
          expect(options?.env?.OPENAI_API_KEY).toBe("test-api-key");

          return Promise.resolve({
            runOnce: () =>
              Promise.resolve({
                response: deterministicScenarios.alarmListEmpty.response,
                status: "spoken",
                textOutputWritten: false,
              }),
          });
        },
      }),
    ).resolves.toBe(0);
    expect(stdout).toEqual([
      `${deterministicScenarios.alarmListEmpty.response.text}\n`,
    ]);
    expect(stderr).toEqual([]);
  });

  it("prints a graceful response when the executable entrypoint rejects", async () => {
    const { io, stdout, stderr } = createCliIo();
    const processState = { exitCode: 0 };

    await runCliEntryPoint(
      () => Promise.reject(new Error("raw setup secret")),
      io,
      processState,
    );

    expect(processState.exitCode).toBe(1);
    expect(stdout).toEqual(
      stdoutLine("I hit a problem and could not complete that."),
    );
    expect(stderr).toEqual(stderrLine("Runtime failure: raw setup secret"));
  });

  it("still supports direct injected IO for low-level CLI boundary coverage", async () => {
    const { io, stdout, stderr } = createCliIo();

    await expect(main(["ask"], io)).resolves.toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr).toEqual([
      'Usage: personal-ai ask [--config path/to/config.json] "command text"\n       personal-ai voice-once [--config path/to/config.json] [--utterance "spoken command"]\n       personal-ai desktop-voice-once [--config path/to/config.json]\n       personal-ai desktop-voice-service --config path/to/desktop-config.json\n       personal-ai pi-service --config path/to/pi-config.json\n',
    ]);
  });
});

function createServiceOptionsAssertion(
  configPath: string,
  io: ReturnType<typeof createCliIo>["io"],
) {
  return (options?: {
    configPath?: string;
    env?: NodeJS.ProcessEnv;
    io?: {
      fallbackOutput?: unknown;
      progressOutput?: unknown;
      stderr?: unknown;
    };
    processSignals?: unknown;
  }): void => {
    if (!options) {
      throw new Error("Expected service runtime options.");
    }

    expect(options.configPath).toBe(configPath);
    expect(options.env?.OPENAI_API_KEY).toBe("test-api-key");
    expect(options.io?.fallbackOutput).toBe(io.stdout);
    expect(options.io?.progressOutput).toBe(io.stdout);
    expect(options.io?.stderr).toBe(io.stderr);
    expect(options.processSignals).toBeDefined();
  };
}

function createRejectingDiagnosticRuntime(error: Error) {
  return {
    handleText: () =>
      Promise.resolve({
        status: "error" as const,
        text: "legacy path should not be used",
      }),
    handleTextWithDiagnostics: () => Promise.reject(error),
  };
}
