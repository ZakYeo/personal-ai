import { fetchProviderJson } from "./http-json-client.js";

describe("fetchProviderJson", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("accepts a response at the default 1 MiB body limit", async () => {
    const value = "a".repeat(1024 * 1024 - 2);

    await expect(
      fetchProviderJson({
        createError: ({ cause, message }) => new Error(message, { cause }),
        fetch: vi.fn(() => Promise.resolve(Response.json(value))),
        invalidJsonMessage: "invalid json",
        nonOkMessage: () => "request failed",
        request: {},
        timeoutMessage: "request timed out",
        timeoutMs: 30_000,
        url: "https://provider.test",
      }),
    ).resolves.toBe(value);
  });

  it("rejects a response above the default 1 MiB body limit", async () => {
    await expect(
      fetchProviderJson({
        createError: ({ cause, message }) => new Error(message, { cause }),
        fetch: vi.fn(() =>
          Promise.resolve(
            new Response(
              new ReadableStream<Uint8Array>({
                start(controller) {
                  controller.enqueue(new Uint8Array(1024 * 1024 + 1));
                },
              }),
            ),
          ),
        ),
        invalidJsonMessage: "invalid json",
        nonOkMessage: () => "request failed",
        request: {},
        timeoutMessage: "request timed out",
        timeoutMs: 30_000,
        url: "https://provider.test",
      }),
    ).rejects.toThrow(
      "Provider response body exceeded the configured byte limit.",
    );
  });

  it("projects the provider request ID into non-success errors", async () => {
    let errorOptions: unknown;

    await expect(
      fetchProviderJson({
        createError: (options) => {
          errorOptions = options;
          return new Error(options.message);
        },
        fetch: vi.fn(() =>
          Promise.resolve(
            new Response("failure", {
              headers: { "x-request-id": "request-123" },
              status: 429,
            }),
          ),
        ),
        invalidJsonMessage: "invalid json",
        nonOkMessage: () => "request failed",
        request: {},
        timeoutMessage: "request timed out",
        timeoutMs: 30_000,
        url: "https://provider.test",
      }),
    ).rejects.toThrow("request failed");

    expect(errorOptions).toEqual({
      message: "request failed",
      requestId: "request-123",
      responseBody: "failure",
      status: 429,
    });
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
