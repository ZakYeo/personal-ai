import { speakResponse } from "./voice-response.js";

describe("speech-owned interruption capture", () => {
  it("joins and aborts interruption capture before releasing completed playback", async () => {
    let captureSignal: AbortSignal | undefined;
    const cleanupFailure = vi.fn();
    const result = await speakResponse(
      {
        audioOutput: { play: () => Promise.resolve() },
        textToSpeech: { synthesize: (text) => Promise.resolve({ text }) },
        interruption: {
          capture: (signal) => {
            captureSignal = signal;
            return new Promise<{ text: string }>((resolve) =>
              signal.addEventListener(
                "abort",
                () => resolve({ text: "late noise" }),
                { once: true },
              ),
            );
          },
          onCleanupFailure: cleanupFailure,
          onRequest: vi.fn(),
          reportFailure: vi.fn(),
          wakePhrases: ["hey jarvis"],
        },
      },
      { status: "ok", text: "A safe answer." },
      {},
    );
    expect(result.status).toBe("spoken");
    expect(captureSignal?.aborted).toBe(true);
    expect(cleanupFailure).not.toHaveBeenCalled();
  });
});
