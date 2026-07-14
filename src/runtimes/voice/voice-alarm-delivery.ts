import type { AlarmDeliveryPort } from "../../ports/alarm-delivery.js";
import type { DesktopVoiceServiceAdapters } from "./desktop-voice-adapter-types.js";
import { cleanupVoiceAdapters } from "./voice-cleanup.js";
import type { VoiceRuntimeIo } from "./voice-runtime-io.js";

type CreateVoiceDeliveryAdapters = (
  shutdownSignal?: AbortSignal,
) => DesktopVoiceServiceAdapters;

export function createVoiceAlarmDelivery(
  createAdapters: CreateVoiceDeliveryAdapters,
  io: VoiceRuntimeIo = {},
): AlarmDeliveryPort {
  return {
    async deliver(alarm, context) {
      const adapters = createAdapters(context.shutdownSignal);
      const text = `Alarm: ${alarm.label}.`;

      try {
        if (adapters.streamingOutput) {
          const speech =
            await adapters.streamingOutput.textToSpeech.synthesizeStream(text);
          await adapters.streamingOutput.audioOutput.playStream(speech.chunks);
          return;
        }

        const speech = await adapters.textToSpeech.synthesize(text);
        await adapters.audioOutput.play(speech);
      } finally {
        await cleanupVoiceAdapters(() => adapters.cleanup?.(), io);
      }
    },
  };
}
