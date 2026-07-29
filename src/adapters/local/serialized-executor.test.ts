import { createSerializedExecutor } from "./serialized-executor.js";

describe("createSerializedExecutor", () => {
  it("runs operations one at a time in submission order", async () => {
    const execute = createSerializedExecutor();
    const events: string[] = [];
    let releaseFirst: (() => void) | undefined;

    const first = execute(
      () =>
        new Promise<string>((resolve) => {
          events.push("first started");
          releaseFirst = () => {
            events.push("first finished");
            resolve("first");
          };
        }),
    );
    const second = execute(() => {
      events.push("second started");
      return Promise.resolve("second");
    });

    await vi.waitFor(() => {
      expect(releaseFirst).toBeDefined();
    });
    expect(events).toEqual(["first started"]);
    releaseFirst?.();

    await expect(Promise.all([first, second])).resolves.toEqual([
      "first",
      "second",
    ]);
    expect(events).toEqual([
      "first started",
      "first finished",
      "second started",
    ]);
  });

  it("continues the queue after an operation rejects", async () => {
    const execute = createSerializedExecutor();
    const failure = new Error("write failed");

    const rejected = execute(() => Promise.reject(failure));
    const recovered = execute(() => Promise.resolve("recovered"));

    await expect(rejected).rejects.toBe(failure);
    await expect(recovered).resolves.toBe("recovered");
  });
});
