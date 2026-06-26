import { execPath } from "node:process";
import type { CommandExecutionError } from "./process-runner.js";
import { CommandTimeoutError, runCommand } from "./process-runner.js";

describe("runCommand", () => {
  it("captures stdout and stderr from a successful command", async () => {
    await expect(
      runCommand({
        args: [
          "-e",
          "process.stdout.write('transcript'); process.stderr.write('diagnostic');",
        ],
        command: execPath,
      }),
    ).resolves.toEqual({
      stderr: "diagnostic",
      stdout: "transcript",
    });
  });

  it("rejects non-zero exits with preserved diagnostics", async () => {
    await expect(
      runCommand({
        args: [
          "-e",
          "process.stderr.write('provider failed'); process.exit(7);",
        ],
        command: execPath,
      }),
    ).rejects.toMatchObject({
      code: 7,
      stderr: "provider failed",
    } satisfies Partial<CommandExecutionError>);
  });

  it("rejects commands that exceed their timeout", async () => {
    await expect(
      runCommand({
        args: ["-e", "setTimeout(() => undefined, 1000);"],
        command: execPath,
        timeoutMs: 10,
      }),
    ).rejects.toBeInstanceOf(CommandTimeoutError);
  });
});
