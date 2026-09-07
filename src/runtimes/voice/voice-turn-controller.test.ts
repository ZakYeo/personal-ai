import { createVoiceTurnController } from "./voice-turn-controller.js";

describe("voice turn controller", () => {
  it("quarantines an active turn after a sibling capture cleanup failure", () => {
    const onCleanupFailure = vi.fn();
    const controller = createVoiceTurnController({ onCleanupFailure });
    const turn = controller.begin();
    const failure = new Error("capture cleanup failed");
    controller.quarantine(failure);
    expect(turn.signal.aborted).toBe(true);
    expect(controller.failed).toBe(true);
    turn.dispose();
    expect(() => controller.begin()).toThrow(failure);
    expect(onCleanupFailure).toHaveBeenCalledExactlyOnceWith(failure);
  });

  it("fails closed if a caller releases ownership before an operation settles", async () => {
    const controller = createVoiceTurnController();
    const turn = controller.begin();
    const work = turn.run(
      () =>
        new Promise<void>((resolve) =>
          turn.signal.addEventListener("abort", () => resolve(), {
            once: true,
          }),
        ),
    );
    const observed = Promise.allSettled([work]);
    turn.dispose();
    await observed;
    expect(controller.failed).toBe(true);
    expect(() => controller.begin()).toThrow(/cleanup/iu);
  });

  it("cancels one turn, waits for its release, and permits a fresh turn", async () => {
    const controller = createVoiceTurnController();
    const service = new AbortController();
    const turn = controller.begin(service.signal);
    expect(() => controller.begin()).toThrow(/active/iu);
    const work = turn
      .run(
        () =>
          new Promise<void>((_resolve, reject) => {
            turn.signal.addEventListener(
              "abort",
              () => reject(new Error("capture stopped")),
              { once: true },
            );
          }),
      )
      .finally(() => turn.dispose());
    const observed = Promise.allSettled([work]);
    await controller.cancel();
    expect((await observed)[0]?.status).toBe("rejected");
    expect(service.signal.aborted).toBe(false);
    const next = controller.begin(service.signal);
    await expect(next.run(() => Promise.resolve("fresh"))).resolves.toBe(
      "fresh",
    );
    next.dispose();
  });

  it("quarantines an uncooperative turn and preserves the cleanup failure", async () => {
    vi.useFakeTimers();
    try {
      const failure = vi.fn();
      const controller = createVoiceTurnController({
        onCleanupFailure: failure,
      });
      const turn = controller.begin();
      const work = turn
        .run(() => new Promise<void>(() => {}))
        .finally(() => turn.dispose());
      const observed = Promise.allSettled([work, controller.cancel()]);
      await vi.advanceTimersByTimeAsync(1600);
      expect((await observed).map((result) => result.status)).toEqual([
        "rejected",
        "rejected",
      ]);
      expect(failure).toHaveBeenCalledOnce();
      expect(() => controller.begin()).toThrow(/cleanup/iu);
    } finally {
      vi.useRealTimers();
    }
  });
});
