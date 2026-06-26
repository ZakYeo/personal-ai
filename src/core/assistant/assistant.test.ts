import { createAssistant } from "./assistant.js";
import type { IntentInterpreterPort } from "../../ports/intent.js";
import {
  createAssistantConfig,
  createCommand,
  createFeature,
  createFixedClock,
  createInterpreter,
  requireConfirmationFor,
} from "../../test-support/core-assistant.js";

const config = createAssistantConfig({
  test: { enabled: true },
  disabled: { enabled: false },
});
const clock = createFixedClock();

describe("createAssistant", () => {
  it("routes interpreted commands to an enabled feature", async () => {
    const command = createCommand("test.echo");
    const feature = createFeature({
      canHandle: (candidate) => candidate.capability === "test.echo",
      execute: () => Promise.resolve({ text: "Handled deterministically." }),
    });
    const assistant = createAssistant({
      clock,
      config,
      features: [feature],
      intentInterpreter: createInterpreter(command),
    });

    await expect(assistant.handleText(" hello ")).resolves.toEqual({
      status: "ok",
      text: "Handled deterministically.",
    });
  });

  it("returns the interpreter response for unknown intent", async () => {
    const assistant = createAssistant({
      clock,
      config,
      features: [],
      intentInterpreter: {
        interpret: () =>
          Promise.resolve({
            response: {
              status: "unknown",
              text: "I could not map that to a deterministic command.",
            },
          }),
      },
    });

    await expect(assistant.handleText("what is this")).resolves.toEqual({
      status: "unknown",
      text: "I could not map that to a deterministic command.",
    });
  });

  it("returns unsupported when no enabled feature can handle the command", async () => {
    const disabledFeature = createFeature({
      id: "disabled",
      canHandle: () => true,
      execute: () => Promise.resolve({ text: "Should not execute." }),
    });
    const assistant = createAssistant({
      clock,
      config,
      features: [disabledFeature],
      intentInterpreter: createInterpreter(createCommand("test.echo")),
    });

    await expect(assistant.handleText("hello")).resolves.toEqual({
      status: "unsupported",
      text: "I do not have an enabled feature for test.echo.",
    });
  });

  it("returns an error response when feature execution fails", async () => {
    const failingFeature = createFeature({
      execute: () => Promise.reject(new Error("fixture failure")),
    });
    const assistant = createAssistant({
      clock,
      config,
      features: [failingFeature],
      intentInterpreter: createInterpreter(createCommand("test.echo")),
    });

    await expect(assistant.handleText("hello")).resolves.toEqual({
      status: "error",
      text: "I could not complete that command: fixture failure",
    });
  });

  it("returns an invalid response without executing a malformed command", async () => {
    const execute = vi.fn(() => Promise.resolve({ text: "Should not run." }));
    const feature = createFeature({
      capabilities: [
        {
          name: "test.echo",
          risk: "low",
          parameters: {
            message: { type: "string", required: true },
          },
        },
      ],
      execute,
    });
    const assistant = createAssistant({
      clock,
      config,
      features: [feature],
      intentInterpreter: createInterpreter(createCommand("test.echo")),
    });

    await expect(assistant.handleText("hello")).resolves.toEqual({
      status: "invalid",
      text: "I could not use that command: test.echo requires message.",
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("does not execute commands with non-finite numeric parameters", async () => {
    const execute = vi.fn(() => Promise.resolve({ text: "Should not run." }));
    const feature = createFeature({
      capabilities: [
        {
          name: "test.echo",
          risk: "low",
          parameters: {
            count: { type: "number", required: true },
          },
        },
      ],
      execute,
    });
    const assistant = createAssistant({
      clock,
      config,
      features: [feature],
      intentInterpreter: createInterpreter({
        ...createCommand("test.echo"),
        parameters: {
          count: Number.NaN,
        },
      }),
    });

    await expect(assistant.handleText("hello")).resolves.toEqual({
      status: "invalid",
      text: "I could not use that command: test.echo parameter count must be finite.",
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("returns a confirmation response without executing when policy requires confirmation", async () => {
    const execute = vi.fn(() => Promise.resolve({ text: "Should not run." }));
    const assistant = createAssistant({
      clock,
      config: {
        ...requireConfirmationFor("test", ["test.echo"]),
      },
      features: [
        createFeature({
          execute,
        }),
      ],
      intentInterpreter: createInterpreter(createCommand("test.echo")),
    });

    await expect(assistant.handleText("hello")).resolves.toEqual({
      status: "needs_confirmation",
      text: "I need confirmation before doing that. Please confirm yes or no.",
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("does not interpret empty input", async () => {
    const interpret = vi.fn(() =>
      Promise.resolve({ command: createCommand("test.echo") }),
    );
    const interpreter: IntentInterpreterPort = { interpret };
    const assistant = createAssistant({
      clock,
      config,
      features: [],
      intentInterpreter: interpreter,
    });

    await expect(assistant.handleText("   ")).resolves.toEqual({
      status: "unknown",
      text: "I need a command to help with.",
    });
    expect(interpret).not.toHaveBeenCalled();
  });
});
