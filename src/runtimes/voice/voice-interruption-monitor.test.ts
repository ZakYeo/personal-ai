import { startVoiceInterruptionMonitor } from "./voice-interruption-monitor.js";

describe("voice interruption monitor", () => {
  it("ignores non-wake input and exact output echo before accepting one bounded request", async () => {
    const input = [
      "background noise",
      "Hey Jarvis, stop",
      "Hey Jarvis, List my alarms",
    ];
    const onRequest = vi.fn();
    const monitor = startVoiceInterruptionMonitor({
      capture: () => Promise.resolve({ text: input.shift() ?? "" }),
      onRequest,
      onCleanupFailure: vi.fn(),
      reportFailure: vi.fn(),
      speechText: () => "The phrase is Hey Jarvis, stop.",
      wakePhrases: ["hey jarvis"],
    });
    await vi.waitUntil(() => onRequest.mock.calls.length === 1);
    await monitor.stop();
    expect(onRequest).toHaveBeenCalledExactlyOnceWith({
      text: "List my alarms",
      wakePhrase: "hey jarvis",
    });
    expect(input).toEqual([]);
  });

  it("stops after three irrelevant captures", async () => {
    const capture = vi.fn(() => Promise.resolve({ text: "noise" }));
    const onRequest = vi.fn();
    const monitor = startVoiceInterruptionMonitor({
      capture,
      onRequest,
      onCleanupFailure: vi.fn(),
      reportFailure: vi.fn(),
      speechText: () => "",
      wakePhrases: ["hey jarvis"],
    });
    await vi.waitUntil(() => capture.mock.calls.length === 3);
    await monitor.stop();
    expect(capture).toHaveBeenCalledTimes(3);
    expect(onRequest).not.toHaveBeenCalled();
  });

  it("aborts capture when stopped and refuses a late transcript", async () => {
    let finish: (value: { text: string }) => void = () => {};
    const onRequest = vi.fn();
    let signal: AbortSignal | undefined;
    const monitor = startVoiceInterruptionMonitor({
      capture: (receivedSignal) => {
        signal = receivedSignal;
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
      onRequest,
      onCleanupFailure: vi.fn(),
      reportFailure: vi.fn(),
      speechText: () => "",
      wakePhrases: ["hey jarvis"],
    });
    const stopped = monitor.stop();
    expect(signal?.aborted).toBe(true);
    finish({ text: "Hey Jarvis, stop" });
    await stopped;
    expect(onRequest).not.toHaveBeenCalled();
  });

  it("bounds a stalled capture and reports failed cleanup once", async () => {
    vi.useFakeTimers();
    try {
      const onCleanupFailure = vi.fn();
      const monitor = startVoiceInterruptionMonitor({
        capture: () => new Promise(() => {}),
        onRequest: vi.fn(),
        onCleanupFailure,
        reportFailure: vi.fn(),
        speechText: () => "",
        wakePhrases: ["hey jarvis"],
      });
      const stopped = monitor.stop();
      await vi.advanceTimersByTimeAsync(1_000);
      await stopped;
      expect(onCleanupFailure).toHaveBeenCalledOnce();
      await monitor.stop();
      expect(onCleanupFailure).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});
