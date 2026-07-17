import type { IntentInterpreterPort } from "../ports/intent.js";
import { parseAssistantConfig } from "./config/config.js";
import { defineRuntimeProvider } from "./runtime-provider-registry.js";
import { createConfiguredIntentInterpreter } from "./intent-provider-selection.js";

describe("createConfiguredIntentInterpreter", () => {
  it("lets a registry entry parse and construct a custom intent provider", () => {
    const interpreter: IntentInterpreterPort = {
      start: vi.fn(),
    };
    const createCustom = vi.fn((config: { locale: string }) => {
      void config;

      return interpreter;
    });
    const config = parseAssistantConfig(
      {
        assistant: {
          name: "Jarvis",
          timeZone: "Europe/London",
          wakePhrases: ["hey jarvis"],
        },
        features: {},
        intent: {
          custom: { locale: "en-GB" },
          provider: "custom",
        },
      },
      {
        intentProviderRegistry: {
          custom: defineRuntimeProvider({
            configKey: "custom",
            create: (config: { locale: string }) => {
              createCustom(config);

              return interpreter;
            },
            parseConfig: (value) => {
              if (
                typeof value !== "object" ||
                value === null ||
                !("locale" in value) ||
                typeof value.locale !== "string"
              ) {
                throw new Error("custom locale required");
              }

              return { locale: value.locale };
            },
          }),
        },
      },
    );

    expect(
      createConfiguredIntentInterpreter(config, [], [], {
        env: {},
        fetch: vi.fn(),
      }),
    ).toBe(interpreter);

    expect(createCustom).toHaveBeenCalledWith({ locale: "en-GB" });
  });
});
