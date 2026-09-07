import { speakResponse } from "./voice-response.js";
import { createVoiceAlarmDelivery } from "./voice-alarm-delivery.js";
import type { StreamingVoiceOutput } from "./streaming-voice.js";

describe("voice speech completion", () => {
  it.each(["empty", "ignored", "partial"])(
    "does not acknowledge %s streamed speech",
    async (mode) => {
      const adapters = createOutput(mode);
      const stderr = { write: vi.fn() };
      const fallbackOutput = { write: vi.fn() };
      await expect(
        speakResponse(
          adapters,
          { status: "ok", text: "Safe answer." },
          { stderr, fallbackOutput },
        ),
      ).resolves.toEqual({
        status: "fallback_output",
        textOutputWritten: true,
      });
      expect(fallbackOutput.write).toHaveBeenCalledExactlyOnceWith(
        "Safe answer.\n",
      );
      expect(stderr.write).toHaveBeenCalledOnce();
    },
  );

  it("does not persist empty notification speech as successful delivery", async () => {
    const delivery = createVoiceAlarmDelivery(() => createOutput("empty"));
    await expect(
      delivery.deliver(
        { id: "notification-1", text: "Safe notification." },
        {},
      ),
    ).rejects.toThrow(/audio|speech/iu);
  });

  it("marks first submission once and accepts a completely consumed stream", async () => {
    const onFirstAudioSubmitted = vi.fn();
    await expect(
      speakResponse(
        { ...createOutput("complete"), onFirstAudioSubmitted },
        { status: "ok", text: "Safe answer." },
        {},
      ),
    ).resolves.toMatchObject({ status: "spoken" });
    expect(onFirstAudioSubmitted).toHaveBeenCalledOnce();
  });
});

function createOutput(mode: string) {
  const streamingOutput: StreamingVoiceOutput = {
    textToSpeech: {
      synthesizeStream: (text) =>
        Promise.resolve({ text, chunks: chunks(mode !== "empty") }),
    },
    audioOutput: {
      playStream: async (stream) => {
        if (mode === "ignored") return;
        for await (const chunk of stream) {
          if (mode === "partial" && chunk.byteLength > 0) return;
        }
      },
    },
  };
  return {
    streamingOutput,
    textToSpeech: { synthesize: (text: string) => Promise.resolve({ text }) },
    audioOutput: { play: () => Promise.resolve() },
  };
}

async function* chunks(nonempty: boolean) {
  await Promise.resolve();
  yield new Uint8Array();
  if (nonempty) {
    yield new Uint8Array([1]);
    yield new Uint8Array([2]);
  }
}
