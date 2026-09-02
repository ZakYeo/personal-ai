import { createCapabilityRoutingIndex } from "../../application/capability-catalog.js";
import type {
  IntentInterpretation,
  IntentSessionContinuation,
} from "../../ports/intent.js";
import {
  createAssistantConfig,
  createFixedClock,
  createRawFeature,
} from "../../test-support/core-assistant.js";
import { createAssistant } from "./assistant.js";

describe("assistant profile resolution", () => {
  it("captures a missing narrow profile fact before resuming any selected capability", async () => {
    const harness = createProfileResolutionHarness([
      profileLookupCall(),
      targetClarification(),
      targetCommand("Zak"),
    ]);

    await expect(
      harness.assistant.handleText("Search the internet for myself"),
    ).resolves.toEqual({
      expectsFollowUp: true,
      status: "ok",
      text: "What is your preferred name? I’ll save it to your profile and then continue.",
    });
    await expect(harness.assistant.handleText("Zak")).resolves.toEqual({
      status: "ok",
      text: "I’ll remember that your preferred name is Zak. Search complete.",
    });
    expect(harness.executions).toEqual([
      ["profile.lookup", { field: "preferredName" }],
      ["profile.set", { field: "preferredName", value: "Zak" }],
      ["internet.search", { query: "Zak" }],
    ]);
    expect(harness.continuations).toEqual([
      {
        callId: "profile-read",
        expectedClarification: {
          kind: "application_declared",
          replyCapability: "profile.set",
          replyParameter: "value",
        },
        kind: "tool_result",
        observation: {
          capability: "profile.lookup",
          data: { field: "preferredName", found: false },
          text: "I don’t have your preferred name stored.",
        },
      },
      {
        clarification: {
          capability: "internet.search",
          origin: "intent_interpreter",
          originalText: "Search the internet for myself",
          parameter: "query",
          prompt:
            "What is your preferred name? I’ll save it to your profile and then continue.",
          session: "resume",
        },
        kind: "user_reply",
        text: "Zak",
      },
    ]);
  });

  it("canonicalizes an exact provider save after the target into save-before-resume order", async () => {
    const harness = createProfileResolutionHarness([
      profileLookupCall(),
      targetClarification(),
      targetPlan([
        command("internet.search", { query: "Zak" }),
        command("profile.set", { field: "preferredName", value: "Zak" }),
      ]),
    ]);

    await harness.assistant.handleText("Search the internet for myself");
    await expect(harness.assistant.handleText("Zak")).resolves.toEqual({
      status: "ok",
      text: "I’ll remember that your preferred name is Zak. Search complete.",
    });
    expect(harness.executions).toEqual([
      ["profile.lookup", { field: "preferredName" }],
      ["profile.set", { field: "preferredName", value: "Zak" }],
      ["internet.search", { query: "Zak" }],
    ]);
  });

  it.each([
    {
      label: "duplicate",
      saves: [
        command("profile.set", { field: "preferredName", value: "Zak" }),
        command("profile.set", { field: "preferredName", value: "Zak" }),
      ],
    },
    {
      label: "conflicting",
      saves: [
        command("profile.set", {
          field: "preferredName",
          value: "Someone else",
        }),
      ],
    },
  ])(
    "rejects $label provider profile saves before execution",
    async ({ saves }) => {
      const harness = createProfileResolutionHarness([
        profileLookupCall(),
        targetClarification(),
        targetPlan([command("internet.search", { query: "Zak" }), ...saves]),
      ]);

      await harness.assistant.handleText("Search the internet for myself");
      await expect(harness.assistant.handleText("Zak")).resolves.toEqual({
        status: "error",
        text: "I hit a problem and could not complete that.",
      });
      expect(harness.executions).toEqual([
        ["profile.lookup", { field: "preferredName" }],
      ]);
    },
  );

  it("does not save a missing fact when the reply changes topic", async () => {
    const harness = createProfileResolutionHarness(
      [profileLookupCall(), targetClarification(), { kind: "replacement" }],
      [targetCommand("TypeScript")],
    );

    await harness.assistant.handleText("Search the internet for myself");
    await expect(
      harness.assistant.handleText("Search for TypeScript instead"),
    ).resolves.toEqual({ status: "ok", text: "Search complete." });
    expect(harness.executions).toEqual([
      ["profile.lookup", { field: "preferredName" }],
      ["internet.search", { query: "TypeScript" }],
    ]);
  });

  it("rejects a tool-only profile lookup proposed as a terminal command", async () => {
    let executed = false;
    const assistant = createAssistant({
      capabilityRouting: createCapabilityRoutingIndex([
        createRawFeature({
          id: "profile",
          capabilities: [
            {
              name: "profile.lookup",
              parameters: { field: { required: true, type: "string" } },
              risk: "low",
              toolChain: "read",
              toolOnly: true,
            },
          ],
          execute: () => {
            executed = true;
            return Promise.resolve({ text: "Lookup complete." });
          },
        }),
      ]),
      clock: createFixedClock(),
      config: createAssistantConfig({ profile: { enabled: true } }),
      intentInterpreter: {
        start: () => ({
          next: () =>
            Promise.resolve({
              command: command("profile.lookup", {
                field: "preferredName",
              }),
              kind: "command" as const,
            }),
        }),
      },
    });

    await expect(assistant.handleText("look up my profile")).resolves.toEqual({
      status: "unsupported",
      text: "That internal read is not available as a direct action.",
    });
    expect(executed).toBe(false);
  });
});

function createProfileResolutionHarness(
  firstSession: IntentInterpretation[],
  replacementSession: IntentInterpretation[] = [],
) {
  const continuations: IntentSessionContinuation[] = [];
  const executions: Array<[string, object]> = [];
  let starts = 0;
  const assistant = createAssistant({
    capabilityRouting: createCapabilityRoutingIndex([
      createRawFeature({
        id: "profile",
        capabilities: [
          {
            name: "profile.lookup",
            parameters: { field: { required: true, type: "string" } },
            risk: "low",
            toolChain: "read",
            toolOnly: true,
          },
          {
            name: "profile.set",
            parameters: {
              field: { required: true, type: "string" },
              value: { required: true, type: "string" },
            },
            risk: "low",
          },
        ],
        execute: (request) => {
          executions.push([
            request.capability,
            { ...request.command.parameters },
          ]);
          return Promise.resolve(
            request.capability === "profile.lookup"
              ? missingProfileLookupResult()
              : {
                  responseRewrite: "disabled" as const,
                  text: "I’ll remember that your preferred name is Zak.",
                },
          );
        },
      }),
      createRawFeature({
        id: "internetSearch",
        capabilities: [
          {
            name: "internet.search",
            parameters: { query: { required: true, type: "string" } },
            risk: "low",
          },
        ],
        execute: (request) => {
          executions.push([
            request.capability,
            { ...request.command.parameters },
          ]);
          return Promise.resolve({ text: "Search complete." });
        },
      }),
    ]),
    clock: createFixedClock(),
    config: createAssistantConfig({
      internetSearch: { enabled: true },
      profile: { enabled: true },
    }),
    intentInterpreter: {
      start: () => {
        const steps = starts++ === 0 ? firstSession : replacementSession;
        return {
          next: (continuation) => {
            if (continuation) continuations.push(continuation);
            return Promise.resolve(steps.shift()!);
          },
        };
      },
    },
  });
  return { assistant, continuations, executions };
}

function missingProfileLookupResult() {
  return {
    responseRewrite: "disabled" as const,
    text: "I don’t have your preferred name stored.",
    toolClarification: {
      prompt:
        "What is your preferred name? I’ll save it to your profile and then continue.",
      replyCommand: {
        capability: "profile.set",
        fixedParameters: { field: "preferredName" },
        replyParameter: "value",
      },
    },
    toolObservationData: { field: "preferredName", found: false },
  };
}

function profileLookupCall(): IntentInterpretation {
  return {
    call: {
      command: command("profile.lookup", { field: "preferredName" }),
      id: "profile-read",
    },
    kind: "tool_call",
  };
}

function targetClarification(): IntentInterpretation {
  return {
    clarification: {
      capability: "internet.search",
      origin: "intent_interpreter",
      parameter: "query",
      partialCommand: command("internet.search", {}),
      session: "resume",
    },
    kind: "clarification",
    response: { status: "ok", text: "What should I search for?" },
  };
}

function targetPlan(
  commands: ReturnType<typeof command>[],
): IntentInterpretation {
  return { kind: "plan", plan: { commands } };
}

function targetCommand(query: string): IntentInterpretation {
  return {
    command: command("internet.search", { query }),
    kind: "command",
  };
}

function command(capability: string, parameters: Record<string, string>) {
  return { capability, parameters, rawText: "test request" };
}
