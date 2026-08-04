import type { AssistantCommand } from "../../ports/assistant.js";
import type { CapabilityCatalog } from "../../ports/capability-catalog.js";
import type { IntentInterpretation } from "../../ports/intent.js";
import {
  createAssistantConfig,
  createAssistantHarness,
  createFeature,
} from "../../test-support/core-assistant.js";
import { createSemanticallyValidatedIntentSession } from "./intent-semantic-validation.js";

const capabilityCatalog: CapabilityCatalog = [
  {
    capability: {
      name: "internet.search",
      parameters: {
        query: { required: true, type: "string" },
      },
      risk: "low",
    },
    featureId: "internetSearch",
    featureName: "Internet search",
    parameterText: "query: string (required)",
  },
  {
    capability: {
      name: "assistant.capabilities.list",
      risk: "low",
    },
    featureId: "assistant",
    featureName: "Assistant",
    parameterText: "none",
  },
];

describe("intent semantic validation", () => {
  it("blocks an unsafe compound plan before any step executes", async () => {
    const execute = vi.fn(() => Promise.resolve({ text: "Executed." }));
    const feature = createFeature({
      capability: {
        name: "internet.search",
        parameters: {
          query: { required: true, type: "string" },
        },
        risk: "low",
      },
      execute,
      id: "internetSearch",
    });
    const assistant = createAssistantHarness({
      config: createAssistantConfig({ internetSearch: { enabled: true } }),
      features: [feature],
      interpretation: {
        kind: "plan",
        plan: {
          commands: [
            command("internet.search", { query: "weather tomorrow" }),
            command("internet.search", {
              query: "Can you search the internet",
            }),
          ],
        },
      },
    });

    await expect(
      assistant.handleText("Can you search the internet?"),
    ).resolves.toEqual({
      expectsFollowUp: true,
      status: "ok",
      text: "What details should I use for this request?",
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([
    {
      interpretation: {
        command: command("internet.search", {
          query: "Can you search the internet",
        }),
        kind: "command",
      },
      label: "command",
    },
    {
      interpretation: {
        call: {
          command: command("internet.search", {
            query: "Can you search the internet",
          }),
          id: "call-1",
        },
        kind: "tool_call",
      },
      label: "tool call",
    },
    {
      interpretation: {
        kind: "plan",
        plan: {
          commands: [
            command("internet.search", { query: "weather tomorrow" }),
            command("internet.search", {
              query: "Can you search the internet",
            }),
          ],
        },
      },
      label: "compound plan",
    },
  ] satisfies Array<{
    interpretation: IntentInterpretation;
    label: string;
  }>)(
    "clarifies when a required parameter echoes the whole request in a $label",
    async ({ interpretation }) => {
      const session = createSemanticallyValidatedIntentSession({
        capabilityCatalog,
        originalText: "Can you search the internet?",
        session: fixedSession(interpretation),
      });

      await expect(session.next()).resolves.toEqual(
        canonicalClarification(
          "internet.search",
          interpretation.kind === "tool_call" ? "restart" : "resume",
        ),
      );
    },
  );

  it("rejects a narrow action question wrapped in a compound plan", async () => {
    const session = createSemanticallyValidatedIntentSession({
      capabilityCatalog,
      originalText: "Can you set an alarm?",
      session: fixedSession({
        kind: "plan",
        plan: {
          commands: [
            command("internet.search", { query: "alarm clocks" }),
            command("assistant.capabilities.list"),
          ],
        },
      }),
    });

    await expect(session.next()).resolves.toEqual(
      canonicalClarification("assistant.capabilities.list", "resume"),
    );
  });

  it("uses the original request when validating continuation output", async () => {
    const next = vi
      .fn()
      .mockResolvedValueOnce({
        call: {
          command: command("internet.search", { query: "weather tomorrow" }),
          id: "call-1",
        },
        kind: "tool_call",
      })
      .mockResolvedValueOnce({
        command: command("internet.search", {
          query: "Can you search the internet",
        }),
        kind: "command",
      });
    const session = createSemanticallyValidatedIntentSession({
      capabilityCatalog,
      originalText: "Can you search the internet?",
      session: { next },
    });

    await session.next();

    await expect(
      session.next({
        callId: "call-1",
        kind: "tool_result",
        observation: {
          capability: "internet.search",
          text: "Weather result.",
        },
      }),
    ).resolves.toEqual(canonicalClarification("internet.search", "resume"));
  });

  it("normalizes provider clarification status at the shared boundary", async () => {
    const session = createSemanticallyValidatedIntentSession({
      capabilityCatalog,
      originalText: "Search for something",
      session: fixedSession({
        clarification: {
          origin: "intent_interpreter",
          session: "resume",
        },
        kind: "clarification",
        response: { status: "unknown", text: "What should I search for?" },
      }),
    });

    await expect(session.next()).resolves.toEqual({
      clarification: {
        origin: "intent_interpreter",
        session: "resume",
      },
      kind: "clarification",
      response: { status: "ok", text: "What should I search for?" },
    });
  });

  it("preserves a semantically resolved compound plan", async () => {
    const interpretation: IntentInterpretation = {
      kind: "plan",
      plan: {
        commands: [
          command("internet.search", { query: "weather tomorrow" }),
          command("internet.search", { query: "train times" }),
        ],
      },
    };
    const session = createSemanticallyValidatedIntentSession({
      capabilityCatalog,
      originalText: "Search for weather tomorrow and train times",
      session: fixedSession(interpretation),
    });

    await expect(session.next()).resolves.toBe(interpretation);
  });
});

function canonicalClarification(
  capability: string,
  session: "restart" | "resume",
): IntentInterpretation {
  return {
    clarification: {
      capability,
      origin: "semantic_validation",
      session,
    },
    kind: "clarification",
    response: {
      status: "ok",
      text: "What details should I use for this request?",
    },
  };
}

function command(
  capability: string,
  parameters: AssistantCommand["parameters"] = {},
): AssistantCommand {
  return { capability, parameters, rawText: "provider text" };
}

function fixedSession(interpretation: IntentInterpretation) {
  return { next: () => Promise.resolve(interpretation) };
}
