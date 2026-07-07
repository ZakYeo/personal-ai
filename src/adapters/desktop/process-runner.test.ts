import {
  createFailingCommandScript,
  createShellCommand,
  createSuccessfulCommandScript,
} from "../../test-support/adapter-contract.js";
import type {
  CommandExecutionError,
  CommandSpawnError,
  CommandTimeoutError,
} from "./process-runner.js";
import type { ProcessControl } from "../../ports/process-control.js";
import {
  runCommand,
  runCommandReadableStream,
  runCommandUntilStdoutLine,
  runCommandWritableStream,
} from "./process-runner.js";

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

  it("rejects spawn failures with preserved diagnostics", async () => {
    await expect(
      runCommand({
        command: "/definitely/missing/personal-ai-command",
      }),
    ).rejects.toMatchObject({
      cause: expect.any(Error) as Error,
      stderr: "",
      stdout: "",
    } satisfies Partial<CommandSpawnError>);
  });
});

describe("runCommandUntilStdoutLine", () => {
  it("terminates the selected process group through injected process control", async () => {
    const killedProcessGroups: number[] = [];
    const processControl: ProcessControl = {
      kill: (pid) => {
        killedProcessGroups.push(pid);
      },
      platform: "linux",
    };
    const result = await runCommandUntilStdoutLine(
      {
        args: ["-c", 'printf \'{"type":"ready"}\\n\'; sleep 1'],
        command: "/bin/sh",
        processControl,
      },
      (line) => {
        const parsed = JSON.parse(line) as { type?: string };

        return parsed.type === "ready" ? parsed : undefined;
      },
    );

    expect(result.line).toEqual({ type: "ready" });
    expect(killedProcessGroups).toHaveLength(1);
    expect(killedProcessGroups[0]).toBeLessThan(0);
  });
});

describe("runCommandReadableStream", () => {
  it("captures stream stdout and stderr diagnostics for non-zero exits", async () => {
    const stream = runCommandReadableStream({
      args: ["-c", "printf 'first'; printf 'diagnostic' >&2; exit 9"],
      command: "/bin/sh",
    });
    const chunks: string[] = [];

    await expect(async () => {
      for await (const chunk of stream.chunks) {
        chunks.push(Buffer.from(chunk).toString("utf8"));
      }
    }).rejects.toMatchObject({
      code: 9,
      stderr: "diagnostic",
      stdout: "first",
    } satisfies Partial<CommandExecutionError>);
    expect(chunks).toEqual(["first"]);
  });
});

describe("runCommandWritableStream", () => {
  it("terminates the command when the input stream fails", async () => {
    const killedProcessGroups: number[] = [];
    const processControl: ProcessControl = {
      kill: (pid, signal) => {
        killedProcessGroups.push(pid);
        process.kill(pid, signal);
      },
      platform: "linux",
    };

    await expect(
      runCommandWritableStream(
        {
          args: ["-c", "cat >/dev/null"],
          command: "/bin/sh",
          processControl,
          timeoutMs: 1_000,
        },
        createFailingInputChunks(),
      ),
    ).rejects.toThrow("input stream failed");

    expect(killedProcessGroups).toHaveLength(1);
    expect(killedProcessGroups[0]).toBeLessThan(0);
  });
});

async function* createFailingInputChunks(): AsyncIterable<Uint8Array> {
  await Promise.resolve();
  yield Buffer.from("partial audio", "utf8");
  throw new Error("input stream failed");
}
