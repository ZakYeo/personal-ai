import {
  createAssistantConfig,
  createAssistantHarness,
  createCommand,
  createFeature,
  createFixedClock,
  createInterpreter,
  enableFeatures,
  fixedNow,
  requireConfirmationFor,
} from "./core-assistant.js";

describe("core assistant test support", () => {
  it("creates default config and fixed clocks", () => {
    expect(createFixedClock().now()).toEqual(fixedNow);
    expect(enableFeatures("calendar", "alarms")).toEqual({
      assistant: {
        name: "Jarvis",
        wakePhrases: ["hey jarvis"],
      },
      intent: {
        provider: "deterministic",
      },
      features: {
        calendar: { enabled: true },
        alarms: { enabled: true },
      },
    });
    expect(requireConfirmationFor("alarms", ["alarm.create"])).toEqual({
      assistant: {
        name: "Jarvis",
        wakePhrases: ["hey jarvis"],
      },
      intent: {
        provider: "deterministic",
      },
      features: {
        alarms: {
          enabled: true,
          confirmationRequiredCapabilities: ["alarm.create"],
        },
      },
    });
  });

  it("creates commands, interpreters, features, and assistant harnesses", async () => {
    const command = createCommand("test.echo", { message: "hello" });
    const execute = vi.fn(() =>
      Promise.resolve({
        text: "Handled by helper.",
      }),
    );
    const assistant = createAssistantHarness({
      config: createAssistantConfig({ test: { enabled: true } }),
      features: [
        createFeature({
          capabilities: [
            {
              name: "test.echo",
              risk: "low",
              parameters: { message: { type: "string" } },
            },
          ],
          execute,
        }),
      ],
      intentInterpreter: createInterpreter(command),
    });

    await expect(assistant.handleText("hello")).resolves.toEqual({
      status: "ok",
      text: "Handled by helper.",
    });
    expect(execute).toHaveBeenCalledWith(
      {
        capability: "test.echo",
        command,
        args: {
          message: "hello",
        },
      },
      expect.objectContaining({
        config: createAssistantConfig({ test: { enabled: true } }),
      }),
    );
  });
});
