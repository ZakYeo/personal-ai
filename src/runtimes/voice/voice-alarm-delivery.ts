import type { NotificationDeliveryPort } from "../../ports/notification-delivery.js";
import type { DesktopVoiceOutputAdapters } from "./desktop-voice-adapter-types.js";
import { cleanupVoiceAdapters } from "./voice-cleanup.js";
import type { VoiceRuntimeIo } from "./voice-runtime-io.js";
import {
  createVoiceOutputCoordinator,
  type VoiceOutputCoordinator,
} from "./voice-output-coordinator.js";

type CreateVoiceDeliveryAdapters = (
  shutdownSignal?: AbortSignal,
) => DesktopVoiceOutputAdapters;

export function createVoiceAlarmDelivery(
  createAdapters: CreateVoiceDeliveryAdapters,
  io: VoiceRuntimeIo = {},
  outputCoordinator: VoiceOutputCoordinator = createVoiceOutputCoordinator(),
): NotificationDeliveryPort {
  return {
    deliver: (notification, context) =>
      outputCoordinator.run(async () => {
        const adapters = createAdapters(context.shutdownSignal);
        const { text } = notification;

        try {
          if (adapters.streamingOutput) {
            const speech =
              await adapters.streamingOutput.textToSpeech.synthesizeStream(
                text,
              );
            await adapters.streamingOutput.audioOutput.playStream(
              speech.chunks,
            );
            return;
          }

          const speech = await adapters.textToSpeech.synthesize(text);
          await adapters.audioOutput.play(speech);
        } finally {
          await cleanupVoiceAdapters(() => adapters.cleanup?.(), io);
        }
      }),
  };
}
