import {
  createAssistantConfig,
  createAssistantHarness,
  createCommand,
  createFeature,
  createFixedClock,
  createInterpreter,
  createRawFeature,
  enableFeatures,
  fixedNow,
  requireConfirmationFor,
} from "./core-assistant.js";
import type { FeatureExecutionRequest } from "../ports/feature.js";

describe("core assistant test support", () => {
  it("creates default config and fixed clocks", () => {
    expect(createFixedClock().now()).toEqual(fixedNow);
    expect(enableFeatures("calendar", "alarms")).toEqual({
      assistant: {
        name: "Jarvis",
        wakePhrases: ["hey jarvis"],
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
    const execute = vi.fn(
      (request: FeatureExecutionRequest<string, { message: string }>) => {
        const message: string = request.args.message;

        return Promise.resolve({
          text: `Handled ${message}.`,
        });
      },
    );
    const assistant = createAssistantHarness({
      config: createAssistantConfig({ test: { enabled: true } }),
      features: [
        createFeature({
          capability: {
            name: "test.echo",
            risk: "low",
            parameters: { message: { type: "string", required: true } },
          },
          execute,
        }),
      ],
      intentInterpreter: createInterpreter(command),
    });

    await expect(assistant.handleText("hello")).resolves.toEqual({
      status: "ok",
      text: "Handled hello.",
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

  it("keeps raw feature fixtures explicit for lower-level contract tests", () => {
    const feature = createRawFeature({
      capabilities: [{ name: "raw.echo", risk: "low" }],
    });

    expect(feature.capabilities).toEqual([{ name: "raw.echo", risk: "low" }]);
  });
});
