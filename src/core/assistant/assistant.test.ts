import { createAssistant } from "./assistant.js";
import type { IntentInterpreterPort } from "../../ports/intent.js";
import {
  createAssistantConfig,
  createConversationCompactor,
  createCommand,
  createFeature,
  createFixedClock,
  createInterpreter,
  requireConfirmationFor,
} from "../../test-support/core-assistant.js";
import type { ConversationState } from "../../ports/conversation.js";

const config = createAssistantConfig({
  test: { enabled: true },
  disabled: { enabled: false },
});
const clock = createFixedClock();

describe("createAssistant", () => {
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

    await expect(assistant.handleText(" hello ")).resolves.toEqual({
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
        clock,
        config,
      },
    );
  });

  it("returns the interpreter response for unknown intent", async () => {
    const assistant = createAssistant({
      clock,
      config,
      features: [],
      intentInterpreter: {
        interpret: () =>
          Promise.resolve({
            kind: "unknown",
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
      Promise.resolve({
        command: createCommand("test.echo"),
        kind: "command" as const,
      }),
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

  it("answers conversation turns with chat history", async () => {
    const respond = vi
      .fn()
      .mockResolvedValueOnce({ status: "ok", text: "I am good." })
      .mockResolvedValueOnce({
        status: "ok",
        text: "I am still good because you asked earlier.",
      });
    const assistant = createAssistant({
      clock,
      config,
      conversation: {
        compactor: createConversationCompactor(),
        history: { maxTurnsBeforeCompaction: 5 },
        responder: { respond },
      },
      features: [],
      intentInterpreter: createInterpreter({ kind: "conversation" }),
    });

    await expect(
      assistant.handleText("Hey Jarvis, how are you today?"),
    ).resolves.toEqual({
      status: "ok",
      text: "I am good.",
    });
    await expect(assistant.handleText("what did I ask?")).resolves.toEqual({
      status: "ok",
      text: "I am still good because you asked earlier.",
    });

    expect(respond).toHaveBeenNthCalledWith(
      1,
      "Hey Jarvis, how are you today?",
      { recentTurns: [] },
      { clock, config },
    );
    expect(respond).toHaveBeenNthCalledWith(
      2,
      "what did I ask?",
      {
        recentTurns: [
          { content: "Hey Jarvis, how are you today?", role: "user" },
          { content: "I am good.", role: "assistant" },
        ],
      },
      { clock, config },
    );
  });

  it("compacts conversation history after the configured number of chats", async () => {
    const compact = vi.fn((state: ConversationState) =>
      Promise.resolve({
        recentTurns: [],
        summary: `summary for ${state.recentTurns.length} turns`,
      }),
    );
    const respond = vi.fn((input: string, state: ConversationState) =>
      Promise.resolve({
        status: "ok" as const,
        text: state.summary
          ? `answered ${input} with ${state.summary}`
          : `answered ${input}`,
      }),
    );
    const assistant = createAssistant({
      clock,
      config,
      conversation: {
        compactor: { compact },
        history: { maxTurnsBeforeCompaction: 2 },
        responder: { respond },
      },
      features: [],
      intentInterpreter: createInterpreter({ kind: "conversation" }),
    });

    await assistant.handleText("first");
    await assistant.handleText("second");
    await expect(assistant.handleText("third")).resolves.toEqual({
      status: "ok",
      text: "answered third with summary for 4 turns",
    });

    expect(compact).toHaveBeenCalledTimes(1);
    expect(compact).toHaveBeenCalledWith(
      {
        recentTurns: [
          { content: "first", role: "user" },
          { content: "answered first", role: "assistant" },
          { content: "second", role: "user" },
          { content: "answered second", role: "assistant" },
        ],
      },
      { clock, config },
    );
  });

  it("does not answer conversation turns when conversation is not configured", async () => {
    const assistant = createAssistant({
      clock,
      config,
      features: [],
      intentInterpreter: createInterpreter({ kind: "conversation" }),
    });

    await expect(assistant.handleText("how are you?")).resolves.toEqual({
      status: "unknown",
      text: "I could not understand that command.",
    });
  });

  it("returns safe diagnostics when conversation response fails", async () => {
    const cause = new Error("provider secret failure");
    const assistant = createAssistant({
      clock,
      config,
      conversation: {
        compactor: createConversationCompactor(),
        history: { maxTurnsBeforeCompaction: 5 },
        responder: {
          respond: () => Promise.reject(cause),
        },
      },
      features: [],
      intentInterpreter: createInterpreter({ kind: "conversation" }),
    });

    await expect(
      assistant.handleTextWithDiagnostics("how are you?"),
    ).resolves.toEqual({
      diagnostics: [
        {
          category: "conversation_failure",
          cause,
          message: "provider secret failure",
        },
      ],
      response: {
        status: "error",
        text: "I could not answer that right now.",
      },
    });
  });
});
