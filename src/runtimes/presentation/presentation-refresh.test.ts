import { createPresentationRefresh } from "./presentation-refresh.js";

describe("presentation refresh ownership", () => {
  afterEach(() => vi.useRealTimers());

  it("coalesces requests while a read is pending", async () => {
    let finish: ((value: string) => void) | undefined;
    const read = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    const publish = vi.fn();
    const refresh = createPresentationRefresh({
      read,
      publish,
      reportFailure: vi.fn(),
    });
    const first = refresh.request();
    await Promise.resolve();
    for (let index = 0; index < 100; index += 1) void refresh.request();
    finish?.("current");
    await first;
    expect(read).toHaveBeenCalledOnce();
    expect(publish).toHaveBeenCalledWith("current");
    refresh.stop();
  });

  it("bounds waiting without spawning more reads or publishing a late result", async () => {
    vi.useFakeTimers();
    let finish: ((value: string) => void) | undefined;
    const read = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    const publish = vi.fn();
    const reportFailure = vi.fn();
    const refresh = createPresentationRefresh({ read, publish, reportFailure });
    const pending = refresh.request();
    await vi.advanceTimersByTimeAsync(5_000);
    await pending;
    await refresh.request();
    expect(read).toHaveBeenCalledOnce();
    expect(reportFailure).toHaveBeenCalledWith(
      new Error("Presentation refresh did not complete within 5000ms."),
    );
    finish?.("stale");
    await Promise.resolve();
    expect(publish).not.toHaveBeenCalled();
    refresh.stop();
  });

  it("stops immediately and discards in-flight results", async () => {
    let finish: ((value: string) => void) | undefined;
    const publish = vi.fn();
    const refresh = createPresentationRefresh({
      read: () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
      publish,
      reportFailure: vi.fn(),
    });
    const pending = refresh.request();
    await Promise.resolve();
    refresh.stop();
    finish?.("late");
    await pending;
    await refresh.request();
    expect(publish).not.toHaveBeenCalled();
  });
});
