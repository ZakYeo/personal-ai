import { systemRuntimeBackgroundTaskTimer } from "./background-task.js";

describe("systemRuntimeBackgroundTaskTimer", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves immediately without listeners when already aborted", async () => {
    vi.useFakeTimers();
    const shutdown = new AbortController();
    shutdown.abort();
    const addEventListener = vi.spyOn(shutdown.signal, "addEventListener");

    await systemRuntimeBackgroundTaskTimer.wait(60_000, shutdown.signal);

    expect(addEventListener).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("removes the abort listener after the timeout fires", async () => {
    vi.useFakeTimers();
    const shutdown = new AbortController();
    const removeEventListener = vi.spyOn(
      shutdown.signal,
      "removeEventListener",
    );
    const addEventListener = vi.spyOn(shutdown.signal, "addEventListener");
    const waiting = systemRuntimeBackgroundTaskTimer.wait(
      60_000,
      shutdown.signal,
    );

    await vi.advanceTimersByTimeAsync(60_000);
    await waiting;

    const registeredListener = addEventListener.mock.calls[0]?.[1];
    expect(registeredListener).toEqual(expect.any(Function));
    expect(removeEventListener).toHaveBeenCalledExactlyOnceWith(
      "abort",
      registeredListener,
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
    const addEventListener = vi.spyOn(shutdown.signal, "addEventListener");
    const waiting = systemRuntimeBackgroundTaskTimer.wait(
      60_000,
      shutdown.signal,
    );

    shutdown.abort();
    await waiting;

    const registeredListener = addEventListener.mock.calls[0]?.[1];
    expect(registeredListener).toEqual(expect.any(Function));
    expect(removeEventListener).toHaveBeenCalledExactlyOnceWith(
      "abort",
      registeredListener,
    );
    expect(vi.getTimerCount()).toBe(0);
  });
});
