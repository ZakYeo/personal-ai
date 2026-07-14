import { createVoiceOutputCoordinator } from "./voice-output-coordinator.js";

describe("createVoiceOutputCoordinator", () => {
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
