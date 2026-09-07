import { runAudioSetupSession } from "./audio-setup-session.js";

describe("guided microphone setup", () => {
  it("plays only accepted bounded audio and clears retained samples afterward", async () => {
    const retained: Uint8Array[] = [];
    const code = await runAudioSetupSession({
      audio: {
        listInputs: () => Promise.resolve([{ id: "mic", label: "Microphone" }]),
        capture: async function* () {
          yield await Promise.resolve(new Uint8Array([0, 64]));
        },
        play: async (chunks) => {
          for await (const chunk of chunks) retained.push(chunk);
        },
      },
      question: vi.fn().mockResolvedValueOnce("1").mockResolvedValue("yes"),
      writeLine: vi.fn(),
      reportFailure: vi.fn(),
      signal: new AbortController().signal,
    });
    expect(code).toBe(0);
    expect(retained).toEqual([new Uint8Array([0, 0])]);
  });

  it("rejects oversized captures before offering playback", async () => {
    const play = vi.fn();
    const reportFailure = vi.fn();
    const code = await runAudioSetupSession({
      audio: {
        listInputs: () => Promise.resolve([{ id: "mic", label: "Microphone" }]),
        capture: async function* () {
          yield await Promise.resolve(new Uint8Array(240_002));
        },
        play,
      },
      question: vi.fn().mockResolvedValueOnce("1").mockResolvedValue("yes"),
      writeLine: vi.fn(),
      reportFailure,
      signal: new AbortController().signal,
    });
    expect(code).toBe(1);
    expect(play).not.toHaveBeenCalled();
    expect(reportFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Audio test exceeded five seconds of PCM.",
      }),
    );
  });
  it("cancels a stalled capture and still closes its iterator", async () => {
    const controller = new AbortController();
    const close = vi.fn().mockResolvedValue({ done: true, value: undefined });
    const code = await runAudioSetupSession({
      audio: {
        listInputs: () => Promise.resolve([{ id: "mic", label: "Microphone" }]),
        capture: () => ({
          [Symbol.asyncIterator]: () => ({
            next: () => {
              queueMicrotask(() => controller.abort(new Error("cancelled")));
              return new Promise<IteratorResult<Uint8Array>>(() => {});
            },
            return: close,
          }),
        }),
        play: vi.fn(),
      },
      question: vi.fn().mockResolvedValueOnce("1").mockResolvedValueOnce("yes"),
      writeLine: vi.fn(),
      reportFailure: vi.fn(),
      signal: controller.signal,
    });
    expect(code).toBe(1);
    expect(close).toHaveBeenCalledOnce();
  }, 200);
  it("never captures without an explicit recording choice", async () => {
    const capture = vi.fn();
    await runAudioSetupSession({
      audio: {
        listInputs: () => Promise.resolve([{ id: "mic", label: "Microphone" }]),
        capture,
        play: vi.fn(),
      },
      question: vi.fn().mockResolvedValueOnce("1").mockResolvedValueOnce("no"),
      writeLine: vi.fn(),
      reportFailure: vi.fn(),
      signal: new AbortController().signal,
    });
    expect(capture).not.toHaveBeenCalled();
  });

  it("shows input levels and requires an explicit playback choice", async () => {
    const sample = new Uint8Array([0, 64, 0, 64]);
    const play = vi.fn();
    const writeLine = vi.fn();
    await runAudioSetupSession({
      audio: {
        listInputs: () => Promise.resolve([{ id: "mic", label: "Microphone" }]),
        capture: async function* () {
          yield await Promise.resolve(sample);
        },
        play,
      },
      question: vi
        .fn()
        .mockResolvedValueOnce("1")
        .mockResolvedValueOnce("yes")
        .mockResolvedValueOnce("no"),
      writeLine,
      reportFailure: vi.fn(),
      signal: new AbortController().signal,
    });
    expect(play).not.toHaveBeenCalled();
    expect(writeLine).toHaveBeenCalledWith("Input level: 50%.");
    expect(writeLine).toHaveBeenCalledWith("Test audio discarded.");
  });
});
