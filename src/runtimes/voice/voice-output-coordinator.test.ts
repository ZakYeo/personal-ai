import { createVoiceOutputCoordinator } from "./voice-output-coordinator.js";

describe("createVoiceOutputCoordinator", () => {
  it("bounds admission and skips cancelled queued operations", async () => {
    const coordinator = createVoiceOutputCoordinator();
    const operation = vi.fn(() => Promise.resolve());
    const admitted = Promise.allSettled(
      Array.from({ length: 32 }, () => coordinator.run(operation)),
    );
    await expect(coordinator.run(operation)).rejects.toThrow("queue is full");
    await coordinator.interrupt();
    await admitted;
    expect(operation.mock.calls.length).toBeLessThan(32);
  });

  it("interrupts active output and discards queued output without replay", async () => {
    const coordinator = createVoiceOutputCoordinator();
    const started = vi.fn();
    const first = coordinator.run(
      (signal) =>
        new Promise<void>((_resolve, reject) => {
          started();
          signal.addEventListener(
            "abort",
            () => reject(new Error("Output stopped", { cause: signal.reason })),
            {
              once: true,
            },
          );
        }),
    );
    const queued = vi.fn(() => Promise.resolve());
    const second = coordinator.run(queued);
    const results = Promise.allSettled([first, second]);
    await vi.waitUntil(() => started.mock.calls.length === 1);
    await coordinator.interrupt();
    expect((await results).map((result) => result.status)).toEqual([
      "rejected",
      "rejected",
    ]);
    expect(queued).not.toHaveBeenCalled();
    const replacement = vi.fn(() => Promise.resolve("replacement"));
    await expect(coordinator.run(replacement)).resolves.toBe("replacement");
    expect(replacement).toHaveBeenCalledOnce();
  });

  it("bounds cleanup and refuses overlapping output after an uncooperative operation", async () => {
    vi.useFakeTimers();
    try {
      const coordinator = createVoiceOutputCoordinator();
      const started = vi.fn();
      const first = coordinator.run(() => {
        started();
        return new Promise<void>(() => {});
      });
      const observed = Promise.allSettled([first]);
      await Promise.resolve();
      const interrupted = coordinator.interrupt();
      const settledInterrupt = Promise.allSettled([interrupted]);
      await vi.advanceTimersByTimeAsync(1000);
      expect((await observed)[0]?.status).toBe("rejected");
      expect((await settledInterrupt)[0]?.status).toBe("rejected");
      const replacement = vi.fn(() => Promise.resolve());
      await expect(coordinator.run(replacement)).rejects.toThrow(/cleanup/iu);
      expect(started).toHaveBeenCalledOnce();
      expect(replacement).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("serializes output sessions without blocking work before a session", async () => {
    const coordinator = createVoiceOutputCoordinator();
    const events: string[] = [];
    let releaseFirst: (() => void) | undefined;
    const first = coordinator.run(
      () =>
        new Promise<void>((resolve) => {
          events.push("first started");
          releaseFirst = resolve;
        }),
    );

    events.push("capture remains independent");
    const second = coordinator.run(() => {
      events.push("second started");
      return Promise.resolve();
    });
    await Promise.resolve();

    expect(events).toEqual(["capture remains independent", "first started"]);
    releaseFirst?.();
    await Promise.all([first, second]);
    expect(events).toEqual([
      "capture remains independent",
      "first started",
      "second started",
    ]);
  });
});
