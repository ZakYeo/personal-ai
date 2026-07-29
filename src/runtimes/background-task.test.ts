import { systemRuntimeBackgroundTaskTimer } from "./background-task.js";

describe("systemRuntimeBackgroundTaskTimer", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves immediately without listeners when already aborted", async () => {
    const shutdown = new AbortController();
    shutdown.abort();
    const addEventListener = vi.spyOn(shutdown.signal, "addEventListener");

    await systemRuntimeBackgroundTaskTimer.wait(60_000, shutdown.signal);

    expect(addEventListener).not.toHaveBeenCalled();
  });

  it("removes the abort listener after the timeout fires", async () => {
    vi.useFakeTimers();
    const shutdown = new AbortController();
    const removeEventListener = vi.spyOn(
      shutdown.signal,
      "removeEventListener",
    );
    const waiting = systemRuntimeBackgroundTaskTimer.wait(
      60_000,
      shutdown.signal,
    );

    await vi.advanceTimersByTimeAsync(60_000);
    await waiting;

    expect(removeEventListener).toHaveBeenCalledExactlyOnceWith(
      "abort",
      expect.any(Function),
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels the timeout and removes its listener on abort", async () => {
    vi.useFakeTimers();
    const shutdown = new AbortController();
    const removeEventListener = vi.spyOn(
      shutdown.signal,
      "removeEventListener",
    );
    const waiting = systemRuntimeBackgroundTaskTimer.wait(
      60_000,
      shutdown.signal,
    );

    shutdown.abort();
    await waiting;

    expect(removeEventListener).toHaveBeenCalledExactlyOnceWith(
      "abort",
      expect.any(Function),
    );
    expect(vi.getTimerCount()).toBe(0);
  });
});
