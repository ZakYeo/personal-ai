import type { StreamingSpeechToTextPort } from "../../ports/voice.js";
import type { ResolvedVoiceConfig } from "../config/voice-config.js";
import {
  defineDesktopVoiceProviderAdapter,
  type DesktopVoiceProviderSlotDescriptor,
} from "./desktop-voice-adapter-types.js";
import { resolveDesktopVoiceProviderSlot } from "./desktop-voice-slot-topology.js";

describe("desktop voice provider slot topology", () => {
  it("allows registry entries in one slot to own different config types", () => {
    const descriptor: DesktopVoiceProviderSlotDescriptor<StreamingSpeechToTextPort> =
      {
        registry: {
          alternate: defineDesktopVoiceProviderAdapter({
            create: (config: { locale: string }) => ({
              transcribeStream: () => Promise.resolve({ text: config.locale }),
            }),
            resolveConfig: () => ({ locale: "en-GB" }),
          }),
          numeric: defineDesktopVoiceProviderAdapter({
            create: (config: { sampleRate: number }) => ({
              transcribeStream: () =>
                Promise.resolve({ text: String(config.sampleRate) }),
            }),
            resolveConfig: () => ({ sampleRate: 24_000 }),
          }),
        },
        voiceKey: "streamingSpeechToText",
      };
    const selected = resolveDesktopVoiceProviderSlot(
      createVoiceConfig("alternate"),
      descriptor,
      {},
    );

    expect(selected.adapterId).toBe("alternate");
  });
});

function createVoiceConfig(streamingSpeechToText: string): ResolvedVoiceConfig {
  return {
    audioOutput: "mock",
    input: "mock",
    speechToText: "mock",
    streamingSpeechToText,
    textToSpeech: "mock",
    wakeWord: "mock",
  };
}
