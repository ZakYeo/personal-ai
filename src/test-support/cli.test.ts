import { createCliIo, runAsk, runCli, writeTempConfig } from "./cli.js";
import { deterministicScenarios } from "./deterministic-scenarios.js";
import {
  deterministicNowIso,
  enabledDeterministicConfig,
} from "./deterministic-runtime-fixtures.js";

describe("CLI integration test support", () => {
  it("captures stdout and stderr writes", () => {
    const { io, stdout, stderr } = createCliIo();

    io.stdout.write("out\n");
    io.stderr.write("err\n");

    expect(stdout).toEqual(["out\n"]);
    expect(stderr).toEqual(["err\n"]);
  });

  it("runs deterministic ask invocations with temporary config files", async () => {
    await expect(
      writeTempConfig(enabledDeterministicConfig),
    ).resolves.toContain("config.json");

    await expect(
      runAsk({
        config: enabledDeterministicConfig,
        env: { PERSONAL_AI_FIXED_NOW: deterministicNowIso },
        text: deterministicScenarios.alarmCreateWithoutConfirmation.text,
      }),
    ).resolves.toEqual({
      exitCode: 0,
      stdout: [
        `${deterministicScenarios.alarmCreateWithoutConfirmation.response.text}\n`,
      ],
      stderr: [],
    });
  });

  it("runs arbitrary CLI args through captured IO", async () => {
    await expect(runCli(["ask"])).resolves.toEqual({
      exitCode: 1,
      stdout: [],
      stderr: [
        'Usage: personal-ai ask [--config path/to/config.json] "command text"\n       personal-ai voice-once [--config path/to/config.json] [--utterance "spoken command"]\n       personal-ai desktop-voice-once [--config path/to/config.json]\n',
      ],
    });
  });
});
