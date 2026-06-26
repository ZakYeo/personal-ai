import type { CommandExecutionError } from "./process-runner.js";
import { CommandTimeoutError, runCommand } from "./process-runner.js";

describe("runCommand", () => {
  it("captures stdout and stderr from a successful command", async () => {
    await expect(
      runCommand({
        args: ["-c", "printf transcript; printf diagnostic >&2"],
        command: "/bin/sh",
      }),
    ).resolves.toEqual({
      stderr: "diagnostic",
      stdout: "transcript",
    });
  });

  it("rejects non-zero exits with preserved diagnostics", async () => {
    await expect(
      runCommand({
        args: ["-c", "printf 'provider failed' >&2; exit 7"],
        command: "/bin/sh",
      }),
    ).rejects.toMatchObject({
      code: 7,
      stderr: "provider failed",
    } satisfies Partial<CommandExecutionError>);
  });

  it("rejects commands that exceed their timeout", async () => {
    await expect(
      runCommand({
        args: ["-c", "sleep 1"],
        command: "/bin/sh",
        timeoutMs: 10,
      }),
    ).rejects.toBeInstanceOf(CommandTimeoutError);
  });
});
