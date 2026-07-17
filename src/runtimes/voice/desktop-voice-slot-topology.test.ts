import { defineDesktopVoiceProviderAdapter } from "./desktop-voice-provider-adapter-registry.js";
import { parseAssistantConfig } from "../config/config.js";

describe("desktop voice provider slot topology", () => {
  it("lets selected registry entries parse different provider config types", () => {
    const config = parseAssistantConfig(
      {
        assistant: {
          name: "Jarvis",
          timeZone: "Europe/London",
          wakePhrases: ["hey jarvis"],
        },
        desktopVoice: {
          alternate: { locale: "en-GB" },
        },
        features: {},
        intent: { provider: "deterministic" },
        voice: { streamingSpeechToText: "alternate" },
      },
      {
        desktopVoiceProviderAdapterRegistry: {
          streamingSpeechToText: {
            alternate: defineDesktopVoiceProviderAdapter({
              configKey: "alternate",
              create: (config: { locale: string }) => ({
                transcribeStream: () =>
                  Promise.resolve({ text: config.locale }),
              }),
              parseConfig: (value) => {
                if (
                  typeof value !== "object" ||
                  value === null ||
                  !("locale" in value) ||
                  typeof value.locale !== "string"
                ) {
                  throw new Error("alternate locale required");
                }

                return { locale: value.locale };
              },
            }),
          },
          streamingTextToSpeech: {},
        },
      },
    );

    const provider = config.desktopVoice?.streamingSpeechToTextProvider;

    expect(provider).toBeDefined();
    expect(provider).not.toHaveProperty("adapterId");
    const adapter = provider?.create({
      dependencies: {
        env: {},
        fetch: vi.fn() as typeof fetch,
        processControl: { kill: vi.fn(), platform: "linux" },
      },
      tempFiles: { cleanup: vi.fn(), createFile: vi.fn() },
    } satisfies Parameters<NonNullable<typeof provider>["create"]>[0]);

    expect(typeof adapter?.transcribeStream).toBe("function");
  });
});
