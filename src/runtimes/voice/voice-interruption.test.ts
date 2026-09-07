import { createVoiceInterruption } from "./voice-interruption.js";

describe("voice interruption", () => {
  it("aborts capture and notification output together, awaiting both cleanups", async () => {
    let finishTurn = () => {};
    let finishOutput = () => {};
    const cancel = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishTurn = resolve;
        }),
    );
    const interrupt = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishOutput = resolve;
        }),
    );
    const stop = createVoiceInterruption({ cancel }, { interrupt });
    let finished = false;
    const stopping = stop().then(() => {
      finished = true;
    });
    const duplicate = stop();
    expect(cancel).toHaveBeenCalledOnce();
    expect(interrupt).toHaveBeenCalledOnce();
    finishTurn();
    await Promise.resolve();
    expect(finished).toBe(false);
    finishOutput();
    await Promise.all([stopping, duplicate]);
    expect(finished).toBe(true);
  });

  it("still waits for output cleanup when turn cleanup fails", async () => {
    let finishOutput = () => {};
    const failure = new Error("private cleanup failure");
    const stop = createVoiceInterruption(
      { cancel: () => Promise.reject(failure) },
      {
        interrupt: () =>
          new Promise<void>((resolve) => {
            finishOutput = resolve;
          }),
      },
    );
    let finished = false;
    const result = stop().catch((error: unknown) => {
      finished = true;
      return error;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(finished).toBe(false);
    finishOutput();
    await expect(result).resolves.toBeInstanceOf(AggregateError);
  });
});
