import type { IntentInterpreterPort } from "../../ports/intent.js";
import {
  createAssistantWithFeatures as createAssistant,
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
  it("rejects oversized input before starting the intent provider", async () => {
    const start = vi.fn<IntentInterpreterPort["start"]>();
    const assistant = createAssistant({
      clock,
      config,
      features: [],
      intentInterpreter: { start },
    });

    await expect(assistant.handleText("x".repeat(16_001))).resolves.toEqual({
      status: "invalid",
      text: "I could not use that command: Request text exceeded the 16000-character application limit.",
    });
    expect(start).not.toHaveBeenCalled();
  });

  it("routes interpreted commands to an enabled feature", async () => {
    const command = createCommand("test.echo", { message: "hello" });
    const execute = vi.fn(() =>
      Promise.resolve({ text: "Handled deterministically." }),
    );
    const feature = createFeature({
      capability: {
        name: "test.echo",
        risk: "low",
        parameters: {
          message: { type: "string", required: true },
        },
      },
      execute,
    });
    const assistant = createAssistant({
      clock,
      config,
      features: [feature],
      intentInterpreter: createInterpreter(command),
    });

    await expect(assistant.handleText(" echo hello ")).resolves.toEqual({
      status: "ok",
      text: "Handled deterministically.",
    });
    expect(execute).toHaveBeenCalledWith(
      {
        capability: "test.echo",
        command,
        args: { message: "hello" },
      },
      {
        capabilityCatalog: [
          {
            capability: feature.capabilities[0],
            featureId: "test",
            featureName: "Test",
            parameterText: "message: string (required)",
          },
        ],
        clock,
        config,
      },
    );
  });

  it("scopes request cancellation to the active feature execution", async () => {
    const shutdown = new AbortController();
    const execute = vi.fn(() => Promise.resolve({ text: "Handled." }));
    const assistant = createAssistant({
      clock,
      config,
      features: [
        createFeature({
          capability: {
            name: "test.echo",
            parameters: {},
            risk: "low",
          },
          execute,
        }),
      ],
      intentInterpreter: createInterpreter(createCommand("test.echo")),
    });

    await assistant.handleText("hello", { signal: shutdown.signal });

    expect(execute).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ signal: shutdown.signal }),
    );
  });

  it("returns the interpreter response for unknown intent", async () => {
    const assistant = createAssistant({
      clock,
      config,
      features: [],
      intentInterpreter: {
        start: () => ({
          next: () =>
            Promise.resolve({
              kind: "unknown",
              response: {
                status: "unknown",
                text: "I could not map that to a deterministic command.",
              },
            }),
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

  it("lets contextual feature predicates decline a declared capability", async () => {
    const feature = createFeature({
      canHandle: () => false,
      execute: () => Promise.resolve({ text: "Should not execute." }),
    });
    const assistant = createAssistant({
      clock,
      config,
      features: [feature],
      intentInterpreter: createInterpreter(createCommand("test.echo")),
    });

    await expect(assistant.handleText("hello")).resolves.toEqual({
      status: "unsupported",
      text: "I do not have an enabled feature for test.echo.",
    });
  });

  it("returns an error response when feature execution fails", async () => {
    const failingFeature = createFeature({
      execute: () =>
        Promise.reject(new Error("provider token secret fixture failure")),
    });
    const assistant = createAssistant({
      clock,
      config,
      features: [failingFeature],
      intentInterpreter: createInterpreter(createCommand("test.echo")),
    });

    await expect(assistant.handleText("hello")).resolves.toEqual({
      status: "error",
      text: "I could not complete that command.",
    });
  });

  it("preserves feature failure diagnostics for runtime boundaries", async () => {
    const cause = new Error("provider token secret fixture failure");
    const failingFeature = createFeature({
      execute: () => Promise.reject(cause),
    });
    const assistant = createAssistant({
      clock,
      config,
      features: [failingFeature],
      intentInterpreter: createInterpreter(createCommand("test.echo")),
    });

    await expect(assistant.handleTextWithDiagnostics("hello")).resolves.toEqual(
      {
        response: {
          status: "error",
          text: "I could not complete that command.",
        },
        diagnostics: [
          {
            category: "feature_failure",
            capability: "test.echo",
            cause,
            message: "provider token secret fixture failure",
          },
        ],
      },
    );
  });

  it("preserves safe feature failure results and their internal diagnostics", async () => {
    const cause = new Error("clothing adviser provider secret failure");
    const rewrite = vi.fn();
    const failingFeature = createFeature({
      execute: () =>
        Promise.resolve({
          citations: [
            {
              title: "Deterministic weather fixture",
              url: "https://example.test/weather-source",
            },
          ],
          data: { location: "Eastbourne", temperature: 19.8 },
          failure: {
            cause,
            message: "Clothing adviser request failed.",
          },
          text: "I found the weather for Eastbourne, but clothing advice is temporarily unavailable.",
        }),
    });
    const assistant = createAssistant({
      clock,
      config,
      features: [failingFeature],
      intentInterpreter: createInterpreter(createCommand("test.echo")),
      responseRewriter: { rewrite },
    });

    await expect(assistant.handleTextWithDiagnostics("hello")).resolves.toEqual(
      {
        response: {
          citations: [
            {
              title: "Deterministic weather fixture",
              url: "https://example.test/weather-source",
            },
          ],
          status: "error",
          text: "I found the weather for Eastbourne, but clothing advice is temporarily unavailable.",
        },
        diagnostics: [
          {
            capability: "test.echo",
            category: "feature_failure",
            cause,
            message: "Clothing adviser request failed.",
          },
        ],
      },
    );
    expect(rewrite).not.toHaveBeenCalled();
  });

  it("returns an invalid response without executing a malformed command", async () => {
    const execute = vi.fn(() => Promise.resolve({ text: "Should not run." }));
    const feature = createFeature({
      capability: {
        name: "test.echo",
        risk: "low",
        parameters: {
          message: { type: "string", required: true },
        },
      },
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
      capability: {
        name: "test.echo",
        risk: "low",
        parameters: {
          count: { type: "number", required: true },
        },
      },
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
          confirmation: () => ({ facts: {}, text: "run the echo command" }),
          execute,
        }),
      ],
      intentInterpreter: createInterpreter(createCommand("test.echo")),
    });

    await expect(assistant.handleText("hello")).resolves.toEqual({
      expectsFollowUp: true,
      status: "needs_confirmation",
      text: "Please confirm: 1. run the echo command. Say yes or no.",
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("executes a pending command only after an explicit confirmation", async () => {
    const command = createCommand("test.echo", { message: "hello" });
    const execute = vi.fn(() =>
      Promise.resolve({ text: "Handled after confirmation." }),
    );
    const interpret = vi.fn(() =>
      Promise.resolve({ command, kind: "command" as const }),
    );
    const assistant = createAssistant({
      clock,
      config: requireConfirmationFor("test", ["test.echo"]),
      features: [
        createFeature({
          capability: {
            name: "test.echo",
            risk: "low",
            parameters: { message: { type: "string", required: true } },
          },
          confirmation: (args) => ({
            facts: { message: args.message },
            text: `echo ${args.message}`,
          }),
          execute,
        }),
      ],
      intentInterpreter: { start: () => ({ next: interpret }) },
    });

    await assistant.handleText("do it");

    await expect(assistant.handleText("yes")).resolves.toEqual({
      status: "ok",
      text: "Handled after confirmation.",
    });
    expect(interpret).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("cancels a pending command after an explicit rejection", async () => {
    const execute = vi.fn(() => Promise.resolve({ text: "Should not run." }));
    const assistant = createAssistant({
      clock,
      config: requireConfirmationFor("test", ["test.echo"]),
      features: [
        createFeature({
          confirmation: () => ({ facts: {}, text: "run the echo command" }),
          execute,
        }),
      ],
      intentInterpreter: createInterpreter(createCommand("test.echo")),
    });

    await assistant.handleText("do it");

    await expect(assistant.handleText("no")).resolves.toEqual({
      status: "ok",
      text: "Okay, I did not do that.",
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("does not interpret empty input", async () => {
    const interpret = vi.fn(() =>
      Promise.resolve({
        command: createCommand("test.echo"),
        kind: "command" as const,
      }),
    );
    const interpreter: IntentInterpreterPort = {
      start: () => ({ next: interpret }),
    };
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
