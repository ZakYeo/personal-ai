import { fetchProviderJson } from "./http-json-client.js";

describe("fetchProviderJson", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not let stalled cancellation hide a declared body limit failure", async () => {
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const pending = fetchProviderJson({
      createError: ({ cause, message }) => new Error(message, { cause }),
      fetch: vi.fn(() =>
        Promise.resolve(
          new Response(new ReadableStream<Uint8Array>({ cancel }), {
            headers: { "content-length": "2" },
          }),
        ),
      ),
      invalidJsonMessage: "invalid json",
      maxResponseBodyBytes: 1,
      nonOkMessage: () => "request failed",
      request: {},
      responseBodyTooLargeMessage: "response too large",
      timeoutMessage: "request timed out",
      timeoutMs: 30_000,
      url: "https://provider.test",
    });
    const settled = pending.catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(1_000);

    expect(await settled).toEqual(
      expect.objectContaining({ message: "response too large" }),
    );
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("does not let stalled cancellation hide a streamed body limit failure", async () => {
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const pending = fetchProviderJson({
      createError: ({ cause, message }) => new Error(message, { cause }),
      fetch: vi.fn(() =>
        Promise.resolve(
          new Response(
            new ReadableStream<Uint8Array>({
              cancel,
              start(controller) {
                controller.enqueue(new Uint8Array(2));
              },
            }),
          ),
        ),
      ),
      invalidJsonMessage: "invalid json",
      maxResponseBodyBytes: 1,
      nonOkMessage: () => "request failed",
      request: {},
      responseBodyTooLargeMessage: "response too large",
      timeoutMessage: "request timed out",
      timeoutMs: 30_000,
      url: "https://provider.test",
    });
    const settled = pending.catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(1_000);

    expect(await settled).toEqual(
      expect.objectContaining({ message: "response too large" }),
    );
    expect(cancel).toHaveBeenCalledOnce();
  });
});
