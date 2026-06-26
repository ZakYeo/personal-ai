import { main, runCliEntryPoint } from "./main.js";
import {
  createCliIo,
  runAsk,
  runCli,
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

describe("personal-ai ask CLI", () => {
  it("prints the calendar response", async () => {
    await expect(
      runAsk({ text: deterministicScenarios.calendarWedding.text }),
    ).resolves.toEqual({
      exitCode: 0,
      stdout: [`${deterministicScenarios.calendarWedding.response.text}\n`],
      stderr: [],
    });
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
    await expect(runCli(["voice-once"])).resolves.toEqual({
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
          deterministicScenarios.alarmCreateWithoutConfirmation.text,
        ],
        { PERSONAL_AI_FIXED_NOW: deterministicNowIso },
      ),
    ).resolves.toMatchObject({
      exitCode: 0,
      stdout: [
        `${deterministicScenarios.alarmCreateWithoutConfirmation.response.text}\n`,
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

  it("prints a graceful response and diagnostics when voice setup fails", async () => {
    const configPath = await writeTempConfig({
      ...enabledDeterministicConfig,
      voice: {
        ...mockVoiceConfig,
        speechToText: "unknown",
      },
    });

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

  it("creates an alarm when an explicit config does not require confirmation", async () => {
    await expect(
      runAsk({
        config: enabledDeterministicConfig,
        env: { PERSONAL_AI_FIXED_NOW: deterministicNowIso },
        text: deterministicScenarios.alarmCreateWithoutConfirmation.text,
      }),
    ).resolves.toMatchObject({
      exitCode: 0,
      stdout: [
        `${deterministicScenarios.alarmCreateWithoutConfirmation.response.text}\n`,
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

  it("prints a deterministic unsupported response", async () => {
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
        'Usage: personal-ai ask [--config path/to/config.json] "command text"\n       personal-ai voice-once [--config path/to/config.json] [--utterance "spoken command"]\n',
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
    const { io, stdout, stderr } = createCliIo();
    const cause = new Error("provider token secret fixture failure");
    cause.stack =
      "Error: provider token secret fixture failure\n    at feature fixture";

    await expect(
      main(["ask", "fail safely"], io, {
        createRuntime: () =>
          Promise.resolve({
            handleText: () =>
              Promise.resolve({
                status: "error",
                text: "legacy path should not be used",
              }),
            handleTextWithDiagnostics: () =>
              Promise.resolve({
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
          }),
      }),
    ).resolves.toBe(1);
    expect(stdout).toEqual(["I could not complete that command.\n"]);
    expect(stdout.join("")).not.toContain("provider token secret");
    expect(stderr).toHaveLength(2);
    expect(stderr[0]).toBe(
      "Feature failure in test.echo: provider token secret fixture failure\n",
    );
    expect(stderr[1]).toContain(
      "Feature failure cause in test.echo: Error: provider token secret fixture failure",
    );
    expect(stderr[1]).toContain("at feature fixture");
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
    expect(stdout).toEqual(["I hit a problem and could not complete that.\n"]);
    expect(stderr).toEqual(["Runtime failure: raw setup secret\n"]);
  });

  it("still supports direct injected IO for low-level CLI boundary coverage", async () => {
    const { io, stdout, stderr } = createCliIo();

    await expect(main(["ask"], io)).resolves.toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr).toEqual([
      'Usage: personal-ai ask [--config path/to/config.json] "command text"\n       personal-ai voice-once [--config path/to/config.json] [--utterance "spoken command"]\n',
    ]);
  });
});
