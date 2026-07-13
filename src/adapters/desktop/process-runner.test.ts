import {
  createFailingCommandScript,
  createShellCommand,
  createSuccessfulCommandScript,
} from "../../test-support/adapter-contract.js";
import type {
  CommandAbortError,
  CommandExecutionError,
  CommandInputError,
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

  it("escalates timed-out commands that ignore SIGTERM and waits for exit", async () => {
    const signals: NodeJS.Signals[] = [];
    const processControl: ProcessControl = {
      kill: (pid, signal) => {
        signals.push(signal);
        process.kill(pid, signal);
      },
      platform: "linux",
    };

    await expect(
      runCommand({
        args: [
          "-c",
          "trap '' TERM; printf ready; while true; do sleep 1; done",
        ],
        command: "/bin/sh",
        processControl,
        terminationGraceMs: 10,
        timeoutMs: 50,
      }),
    ).rejects.toMatchObject({
      stdout: "ready",
      timeoutMs: 50,
    } satisfies Partial<CommandTimeoutError>);

    expect(signals).toEqual(["SIGTERM", "SIGKILL"]);
  });

  it("falls back to direct child signaling when process-group signaling fails", async () => {
    const signals: NodeJS.Signals[] = [];
    const processControl: ProcessControl = {
      kill: (_pid, signal) => {
        signals.push(signal);
        throw Object.assign(new Error("group signal denied"), {
          code: "EPERM",
        });
      },
      platform: "linux",
    };

    await expect(
      Promise.race([
        runCommand({
          args: ["-c", "exec sleep 10"],
          command: "/bin/sh",
          processControl,
          terminationGraceMs: 50,
          timeoutMs: 10,
        }),
        new Promise((_, reject) => {
          setTimeout(
            () => reject(new Error("termination did not settle")),
            500,
          );
        }),
      ]),
    ).rejects.toMatchObject({
      timeoutMs: 10,
    } satisfies Partial<CommandTimeoutError>);
    expect(signals).toEqual(["SIGTERM"]);
  });

  it("rejects after the bounded post-SIGKILL close wait expires", async () => {
    const processGroups: number[] = [];
    const signals: NodeJS.Signals[] = [];
    const processControl: ProcessControl = {
      kill: (pid, signal) => {
        processGroups.push(pid);
        signals.push(signal);
      },
      platform: "linux",
    };

    try {
      await expect(
        runCommand({
          args: ["-c", "printf ready; while true; do sleep 1; done"],
          command: "/bin/sh",
          processControl,
          terminationGraceMs: 10,
          timeoutMs: 10,
        }),
      ).rejects.toMatchObject({
        cause: expect.objectContaining({
          name: "CommandTerminationError",
        }) as Error,
        name: "CommandTimeoutError",
        stdout: "ready",
        timeoutMs: 10,
      });

      expect(signals).toEqual(["SIGTERM", "SIGKILL"]);
    } finally {
      if (processGroups[0] !== undefined) {
        process.kill(processGroups[0], "SIGKILL");
      }
    }
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

  it("terminates the command when the request is aborted", async () => {
    const controller = new AbortController();
    const killedProcessGroups: number[] = [];
    const processControl: ProcessControl = {
      kill: (pid, signal) => {
        killedProcessGroups.push(pid);
        process.kill(pid, signal);
      },
      platform: "linux",
    };

    const result = runCommand({
      args: [
        "-c",
        "printf 'partial transcript'; printf 'partial diagnostic' >&2; sleep 1",
      ],
      command: "/bin/sh",
      processControl,
      signal: controller.signal,
      timeoutMs: 1_000,
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    const reason = new Error("shutdown requested");
    controller.abort(reason);

    await expect(result).rejects.toMatchObject({
      reason,
      stderr: "partial diagnostic",
      stdout: "partial transcript",
    } satisfies Partial<CommandAbortError>);
    expect(killedProcessGroups).toHaveLength(1);
    expect(killedProcessGroups[0]).toBeLessThan(0);
  });
});

describe("runCommandUntilStdoutLine", () => {
  it("terminates the selected process group through injected process control", async () => {
    const killedProcessGroups: number[] = [];
    const signals: NodeJS.Signals[] = [];
    const processControl: ProcessControl = {
      kill: (pid, signal) => {
        killedProcessGroups.push(pid);
        signals.push(signal);
        process.kill(pid, signal);
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
    expect(signals).toEqual(["SIGTERM"]);
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

  it("preserves the input failure when command termination also fails", async () => {
    const processGroups: number[] = [];
    const processControl: ProcessControl = {
      kill: (pid) => {
        processGroups.push(pid);
      },
      platform: "linux",
    };
    const inputFailure = new Error("input stream failed");

    try {
      await expect(
        runCommandWritableStream(
          {
            args: ["-c", "while true; do sleep 1; done"],
            command: "/bin/sh",
            processControl,
            terminationGraceMs: 10,
            timeoutMs: 1_000,
          },
          createFailingInputChunks(inputFailure),
        ),
      ).rejects.toMatchObject({
        cause: expect.objectContaining({
          errors: [
            inputFailure,
            expect.objectContaining({ name: "CommandTerminationError" }),
          ],
        }) as AggregateError,
        message: "input stream failed",
        stderr: "",
        stdout: "",
      } satisfies Partial<CommandInputError>);
    } finally {
      if (processGroups[0] !== undefined) {
        process.kill(processGroups[0], "SIGKILL");
      }
    }
  });

  it("waits for command stdin backpressure before reading more input", async () => {
    let chunksRead = 0;
    const chunks = (async function* () {
      await Promise.resolve();

      for (let index = 0; index < 4; index += 1) {
        chunksRead += 1;
        yield Buffer.alloc(1024 * 1024);
      }
    })();
    const result = runCommandWritableStream(
      {
        args: ["-c", "sleep 0.1; cat >/dev/null"],
        command: "/bin/sh",
        timeoutMs: 1_000,
      },
      chunks,
    );

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(chunksRead).toBeLessThan(4);
    await expect(result).resolves.toBeUndefined();
  });

  it("preserves command diagnostics when stdin closes early", async () => {
    await expect(
      runCommandWritableStream(
        {
          args: ["-c", "exec 0<&-; printf 'playback failed' >&2; sleep 0.1"],
          command: "/bin/sh",
          timeoutMs: 1_000,
        },
        (async function* () {
          await Promise.resolve();
          yield Buffer.alloc(1024 * 1024);
        })(),
      ),
    ).rejects.toMatchObject({
      cause: expect.any(Error) as Error,
      stderr: "playback failed",
    } satisfies Partial<CommandInputError>);
  });

  it("preserves command abort classification after stdin finishes", async () => {
    const controller = new AbortController();
    const reason = new Error("service shutdown requested");
    const result = runCommandWritableStream(
      {
        args: [
          "-c",
          "cat >/dev/null; printf 'playback diagnostic' >&2; sleep 1",
        ],
        command: "/bin/sh",
        signal: controller.signal,
        timeoutMs: 1_000,
      },
      (async function* () {
        await Promise.resolve();
        yield Buffer.from("audio", "utf8");
      })(),
    );

    await new Promise((resolve) => setTimeout(resolve, 20));
    controller.abort(reason);

    await expect(result).rejects.toMatchObject({
      name: "CommandAbortError",
      reason,
      stderr: "playback diagnostic",
    } satisfies Partial<CommandAbortError>);
  });
});

async function* createFailingInputChunks(
  failure: Error = new Error("input stream failed"),
): AsyncIterable<Uint8Array> {
  await Promise.resolve();
  yield Buffer.from("partial audio", "utf8");
  throw failure;
}
