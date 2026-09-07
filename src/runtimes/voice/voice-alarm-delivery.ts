import { playVoiceSpeech } from "./play-voice-speech.js";
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
      outputCoordinator.run(
        async (signal) => {
          const adapters = createAdapters(context.shutdownSignal);
          const text = notification.text;

          try {
            await playVoiceSpeech(adapters, text, { signal });
          } finally {
            await cleanupVoiceAdapters(() => adapters.cleanup?.(), io);
          }
        },
        context.shutdownSignal ? { signal: context.shutdownSignal } : {},
      ),
  };
}
