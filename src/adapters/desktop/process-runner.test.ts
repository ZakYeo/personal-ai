import {
  createFailingCommandScript,
  createShellCommand,
  createSuccessfulCommandScript,
} from "../../test-support/adapter-contract.js";
import type {
  CommandExecutionError,
  CommandTimeoutError,
} from "./process-runner.js";
import { runCommand } from "./process-runner.js";

describe("runCommand", () => {
  it("captures stdout and stderr from a successful command", async () => {
    await expect(
      runCommand(
        createShellCommand(
          createSuccessfulCommandScript("transcript", "diagnostic"),
        ),
      ),
    ).resolves.toEqual({
      stderr: "diagnostic",
      stdout: "transcript",
    });
  });

  it("rejects non-zero exits with preserved diagnostics", async () => {
    await expect(
      runCommand(
        createShellCommand(createFailingCommandScript("provider failed", 7)),
      ),
    ).rejects.toMatchObject({
      code: 7,
      stderr: "provider failed",
    } satisfies Partial<CommandExecutionError>);
  });

  it("rejects commands that exceed their timeout", async () => {
    await expect(
      runCommand({
        args: [
          "-c",
          "printf 'partial transcript'; printf 'partial diagnostic' >&2; sleep 1",
        ],
        command: "/bin/sh",
        timeoutMs: 10,
      }),
    ).rejects.toMatchObject({
      stderr: "partial diagnostic",
      stdout: "partial transcript",
      timeoutMs: 10,
    } satisfies Partial<CommandTimeoutError>);
  });
});
