import type { AudioOutputPort } from "../../ports/voice.js";
import type { DesktopVoiceOutputAdapters } from "./desktop-voice-adapter-types.js";
import { createVoiceAlarmDelivery } from "./voice-alarm-delivery.js";
import { createCapturedWriter, line } from "../../test-support/primitives.js";
import { createVoiceOutputCoordinator } from "./voice-output-coordinator.js";
import { speakResponse } from "./voice-response.js";

describe("createVoiceAlarmDelivery", () => {
  it("stops ordinary speech without fallback or starting a queued notification", async () => {
    const coordinator = createVoiceOutputCoordinator();
    const fallbackOutput = createCapturedWriter();
    const play = vi.fn<AudioOutputPort["play"]>(
      (_speech, options) =>
        new Promise<void>((_resolve, reject) => {
          options?.signal?.addEventListener(
            "abort",
            () => reject(new Error("playback stopped")),
            { once: true },
          );
        }),
    );
    const ordinary = speakResponse(
      {
        outputCoordinator: coordinator,
        textToSpeech: { synthesize: (text) => Promise.resolve({ text }) },
        audioOutput: { play },
      },
      { status: "ok", text: "A safe answer." },
      { fallbackOutput },
    );
    const createAdapters = vi.fn(() =>
      createAdaptersFixture({
        cleanup: () => Promise.resolve(),
        play: () => Promise.resolve(),
        synthesize: (text) => Promise.resolve({ text }),
      }),
    );
    const notification = createVoiceAlarmDelivery(
      createAdapters,
      {},
      coordinator,
    ).deliver({ id: "alarm-1", text: "Alarm." }, {});
    const outcomes = Promise.allSettled([ordinary, notification]);
    await vi.waitUntil(() => play.mock.calls.length === 1);
    await coordinator.interrupt();
    expect(await outcomes).toMatchObject([
      {
        status: "fulfilled",
        value: { status: "cancelled", textOutputWritten: false },
      },
      { status: "rejected" },
    ]);
    expect(createAdapters).not.toHaveBeenCalled();
    expect(fallbackOutput.writes).toEqual([]);
  });

  it("speaks an alarm through fresh configured output adapters", async () => {
    const synthesize = vi.fn().mockResolvedValue({
      filePath: "/tmp/alarm.wav",
      text: "Alarm: tea.",
    });
    const play = vi.fn().mockResolvedValue(undefined);
    const cleanup = vi.fn().mockResolvedValue(undefined);
    const createAdapters = vi.fn(() =>
      createAdaptersFixture({ cleanup, play, synthesize }),
    );
    const delivery = createVoiceAlarmDelivery(createAdapters);
    const shutdown = new AbortController();

    await delivery.deliver(
      {
        id: "alarm-1",
        text: "Alarm: tea.",
      },
      { shutdownSignal: shutdown.signal },
    );

    expect(createAdapters).toHaveBeenCalledExactlyOnceWith(shutdown.signal);
    expect(synthesize).toHaveBeenCalledExactlyOnceWith("Alarm: tea.", {
      signal: expect.any(AbortSignal) as AbortSignal,
    });
    expect(play).toHaveBeenCalledExactlyOnceWith(
      {
        filePath: "/tmp/alarm.wav",
        text: "Alarm: tea.",
      },
      { signal: expect.any(AbortSignal) as AbortSignal },
    );
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("preserves output failure while logging cleanup failure separately", async () => {
    const outputFailure = new Error("output failed");
    const stderr = createCapturedWriter();
    const delivery = createVoiceAlarmDelivery(
      () =>
        createAdaptersFixture({
          cleanup: () => Promise.reject(new Error("cleanup failed")),
          play: () => Promise.reject(outputFailure),
          synthesize: () =>
            Promise.resolve({ filePath: "/tmp/alarm.wav", text: "Alarm" }),
        }),
      { stderr },
    );

    await expect(
      delivery.deliver(
        {
          id: "alarm-1",
          text: "Alarm: tea.",
        },
        {},
      ),
    ).rejects.toBe(outputFailure);
    expect(stderr.writes).toEqual([line("Runtime failure: cleanup failed")]);
  });

  it("waits for ordinary speech before constructing alarm output adapters", async () => {
    const coordinator = createVoiceOutputCoordinator();
    let releaseOrdinary: (() => void) | undefined;
    let ordinaryStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      ordinaryStarted = resolve;
    });
    const ordinary = speakResponse(
      {
        audioOutput: {
          play: () => {
            ordinaryStarted?.();
            return new Promise<void>((resolve) => {
              releaseOrdinary = resolve;
            });
          },
        },
        outputCoordinator: coordinator,
        textToSpeech: {
          synthesize: (text) => Promise.resolve({ text }),
        },
      },
      { status: "ok", text: "Your calendar is clear." },
      {},
    );
    await started;

    const createAlarmOutputAdapters = vi.fn(() =>
      createAdaptersFixture({
        cleanup: () => Promise.resolve(),
        play: () => Promise.resolve(),
        synthesize: (text) => Promise.resolve({ text }),
      }),
    );
    const alarm = createVoiceAlarmDelivery(
      createAlarmOutputAdapters,
      {},
      coordinator,
    ).deliver(
      {
        id: "alarm-1",
        text: "Alarm: tea.",
      },
      {},
    );
    await Promise.resolve();

    expect(createAlarmOutputAdapters).not.toHaveBeenCalled();
    releaseOrdinary?.();
    await Promise.all([ordinary, alarm]);
    expect(createAlarmOutputAdapters).toHaveBeenCalledOnce();
  });
});

function createAdaptersFixture(input: {
  cleanup: () => Promise<void>;
  play: DesktopVoiceOutputAdapters["audioOutput"]["play"];
  synthesize: DesktopVoiceOutputAdapters["textToSpeech"]["synthesize"];
}): DesktopVoiceOutputAdapters {
  return {
    audioOutput: { play: input.play },
    cleanup: input.cleanup,
    textToSpeech: { synthesize: input.synthesize },
  };
}
