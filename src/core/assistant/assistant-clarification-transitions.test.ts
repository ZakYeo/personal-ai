import { createCapabilityRoutingIndex } from "../../ports/capability-catalog.js";
import type {
  IntentInterpretation,
  IntentInterpreterPort,
  IntentSessionContinuation,
} from "../../ports/intent.js";
import {
  createAssistantConfig,
  createFixedClock,
  createRawFeature,
} from "../../test-support/core-assistant.js";
import { createAssistant } from "./assistant.js";

describe("assistant clarification transitions", () => {
  it("treats an open rephrase prompt as a fresh next request", async () => {
    const starts: string[] = [];
    const rephrase = {
      kind: "rephrase",
      response: {
        status: "ok",
        text: "What would you like me to do?",
      },
    } satisfies IntentInterpretation;
    const intentInterpreter: IntentInterpreterPort = {
      start: (text) => {
        starts.push(text);
        return {
          next: () =>
            Promise.resolve(
              text === "Can you do"
                ? rephrase
                : {
                    command: {
                      capability: "assistant.capabilities.list",
                      parameters: {},
                      rawText: text,
                    },
                    kind: "command" as const,
                  },
            ),
        };
      },
    };
    const assistant = createAssistant({
      capabilityRouting: createCapabilityRoutingIndex([
        createRawFeature({
          capabilities: [{ name: "assistant.capabilities.list", risk: "low" }],
          execute: () => Promise.resolve({ text: "I can help." }),
          id: "assistant",
        }),
      ]),
      clock: createFixedClock(),
      config: createAssistantConfig({ assistant: { enabled: true } }),
      intentInterpreter,
    });

    await expect(assistant.handleText("Can you do")).resolves.toEqual({
      expectsFollowUp: true,
      status: "ok",
      text: "What would you like me to do?",
    });
    await expect(
      assistant.handleText("What are your capabilities?"),
    ).resolves.toEqual({ status: "ok", text: "I can help." });
    expect(starts).toEqual(["Can you do", "What are your capabilities?"]);
  });

  it("replaces a pending clarification with a fresh request", async () => {
    const starts: string[] = [];
    const continuations: IntentSessionContinuation[] = [];
    const replacement = {
      kind: "replacement",
    } satisfies IntentInterpretation;
    const intentInterpreter: IntentInterpreterPort = {
      start: (text) => {
        starts.push(text);
        let started = false;
        return {
          next: (continuation) => {
            if (continuation) continuations.push(continuation);
            if (text === "Set an alarm") {
              if (!started) {
                started = true;
                return Promise.resolve({
                  kind: "clarification" as const,
                  response: { status: "ok" as const, text: "What time?" },
                });
              }
              return Promise.resolve(replacement);
            }
            return Promise.resolve({
              command: {
                capability: "assistant.capabilities.list",
                parameters: {},
                rawText: text,
              },
              kind: "command" as const,
            });
          },
        };
      },
    };
    const assistant = createAssistant({
      capabilityRouting: createCapabilityRoutingIndex([
        createRawFeature({
          capabilities: [{ name: "assistant.capabilities.list", risk: "low" }],
          execute: () => Promise.resolve({ text: "I can help." }),
          id: "assistant",
        }),
      ]),
      clock: createFixedClock(),
      config: createAssistantConfig({ assistant: { enabled: true } }),
      intentInterpreter,
    });

    await expect(assistant.handleText("Set an alarm")).resolves.toEqual({
      expectsFollowUp: true,
      status: "ok",
      text: "What time?",
    });
    await expect(
      assistant.handleText("What are your capabilities?"),
    ).resolves.toEqual({ status: "ok", text: "I can help." });
    expect(starts).toEqual(["Set an alarm", "What are your capabilities?"]);
    expect(continuations).toEqual([
      { kind: "user_reply", text: "What are your capabilities?" },
    ]);
  });
});
