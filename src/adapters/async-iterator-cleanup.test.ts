import { cleanupAsyncIteratorWithinDeadline } from "./async-iterator-cleanup.js";

describe("cleanupAsyncIteratorWithinDeadline", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("does nothing when the iterator has no return method", async () => {
    await expect(
      cleanupAsyncIteratorWithinDeadline({ next: vi.fn() }, options),
    ).resolves.toBeUndefined();
  });

  it.each([
    [
      "throws",
      () => {
        throw new Error("cleanup failed");
      },
    ],
    ["rejects", () => Promise.reject(new Error("cleanup failed"))],
  ])("returns an error when iterator cleanup %s", async (_label, cleanup) => {
    await expect(
      cleanupAsyncIteratorWithinDeadline(
        { next: vi.fn(), return: cleanup },
        options,
      ),
    ).resolves.toMatchObject({ message: "cleanup failed" });
  });

  it("returns no error when cleanup succeeds", async () => {
    await expect(
      cleanupAsyncIteratorWithinDeadline(
        {
          next: vi.fn(),
          return: () => Promise.resolve({ done: true, value: undefined }),
        },
        options,
      ),
    ).resolves.toBeUndefined();
  });

  it("bounds cleanup that never settles", async () => {
    const cleanup = cleanupAsyncIteratorWithinDeadline(
      {
        next: vi.fn(),
        return: () => new Promise<IteratorResult<unknown>>(() => {}),
      },
      options,
    );

    await vi.advanceTimersByTimeAsync(1_000);

    await expect(cleanup).resolves.toMatchObject({
      message: "Test producer iterator cleanup timed out after 1000ms.",
    });
  });
});

const options = { label: "Test producer", timeoutMs: 1_000 };
