import type { DesktopVoiceServiceAdapters } from "./desktop-voice-adapter-types.js";
import { createVoiceAlarmDelivery } from "./voice-alarm-delivery.js";
import { createCapturedWriter, line } from "../../test-support/primitives.js";

describe("createVoiceAlarmDelivery", () => {
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
        attempt: 1,
        id: "alarm-1",
        label: "tea",
        scheduledFor: "2026-07-14T09:00:00.000Z",
      },
      { shutdownSignal: shutdown.signal },
    );

    expect(createAdapters).toHaveBeenCalledExactlyOnceWith(shutdown.signal);
    expect(synthesize).toHaveBeenCalledExactlyOnceWith("Alarm: tea.");
    expect(play).toHaveBeenCalledExactlyOnceWith({
      filePath: "/tmp/alarm.wav",
      text: "Alarm: tea.",
    });
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
          attempt: 1,
          id: "alarm-1",
          label: "tea",
          scheduledFor: "2026-07-14T09:00:00.000Z",
        },
        {},
      ),
    ).rejects.toBe(outputFailure);
    expect(stderr.writes).toEqual([line("Runtime failure: cleanup failed")]);
  });
});

function createAdaptersFixture(input: {
  cleanup: () => Promise<void>;
  play: DesktopVoiceServiceAdapters["audioOutput"]["play"];
  synthesize: DesktopVoiceServiceAdapters["textToSpeech"]["synthesize"];
}): DesktopVoiceServiceAdapters {
  return {
    audioInput: { capture: () => Promise.resolve({ text: "" }) },
    audioOutput: { play: input.play },
    cleanup: input.cleanup,
    speechToText: { transcribe: () => Promise.resolve({ text: "" }) },
    textToSpeech: { synthesize: input.synthesize },
    wakeAudioInput: { capture: () => Promise.resolve({ text: "" }) },
    wakeWord: { detect: () => Promise.resolve({ detected: false }) },
  };
}
