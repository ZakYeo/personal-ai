import { createCapabilityRoutingIndex } from "../../ports/capability-catalog.js";
import type {
  IntentInterpretation,
  IntentInterpreterPort,
  IntentSessionContinuation,
} from "../../ports/intent.js";
import type { ResponseRewriteRequest } from "../../ports/response-rewriter.js";
import {
  createAssistantConfig,
  createFixedClock,
  createRawFeature,
} from "../../test-support/core-assistant.js";
import { createAssistant } from "./assistant.js";

describe("assistant clarification transitions", () => {
  it("resumes feature execution follow-ups through the exact intent session", async () => {
    const continuations: IntentSessionContinuation[] = [];
    let firstInterpretation = true;
    const intentInterpreter: IntentInterpreterPort = {
      start: () => ({
        next: (continuation) => {
          if (continuation) continuations.push(continuation);
          const location = firstInterpretation ? "London" : "London, UK";
          firstInterpretation = false;
          return Promise.resolve({
            command: {
              capability: "weather.current",
              parameters: { location },
              rawText: location,
            },
            kind: "command" as const,
          });
        },
      }),
    };
    const assistant = createAssistant({
      capabilityRouting: createCapabilityRoutingIndex([
        createRawFeature({
          capabilities: [
            {
              name: "weather.current",
              parameters: { location: { required: true, type: "string" } },
              risk: "low",
            },
          ],
          execute: (request) =>
            Promise.resolve(
              request.args.location === "London"
                ? {
                    clarification: { kind: "resumable" as const },
                    expectsFollowUp: true,
                    text: "Which London did you mean?",
                  }
                : { text: "It is 21°C in London, England." },
            ),
          id: "weather",
        }),
      ]),
      clock: createFixedClock(),
      config: createAssistantConfig({ weather: { enabled: true } }),
      intentInterpreter,
    });

    await expect(
      assistant.handleText("What is the weather in London?"),
    ).resolves.toEqual({
      expectsFollowUp: true,
      status: "ok",
      text: "Which London did you mean?",
    });
    await expect(assistant.handleText("London, UK")).resolves.toEqual({
      status: "ok",
      text: "It is 21°C in London, England.",
    });
    expect(continuations).toEqual([
      {
        clarification: {
          capability: "weather.current",
          origin: "feature_execution",
          originalText: "What is the weather in London?",
          prompt: "Which London did you mean?",
          session: "resume",
        },
        kind: "user_reply",
        text: "London, UK",
      },
    ]);
  });

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
                  clarification: {
                    origin: "intent_interpreter" as const,
                    session: "resume" as const,
                  },
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
      {
        clarification: {
          origin: "intent_interpreter",
          originalText: "Set an alarm",
          prompt: "What time?",
          session: "resume",
        },
        kind: "user_reply",
        text: "What are your capabilities?",
      },
    ]);
  });

  it("validates a directly resolved reply against the latest user turn", async () => {
    const rewrites: ResponseRewriteRequest[] = [];
    const steps: IntentInterpretation[] = [
      {
        clarification: {
          origin: "intent_interpreter",
          session: "resume",
        },
        kind: "clarification",
        response: { status: "ok", text: "What would you like me to do?" },
      },
      {
        command: {
          capability: "assistant.capabilities.list",
          parameters: {},
          rawText: "What are your capabilities?",
        },
        kind: "command",
      },
    ];
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
      intentInterpreter: {
        start: () => ({ next: () => Promise.resolve(steps.shift()!) }),
      },
      responseRewriter: {
        rewrite: (request) => {
          rewrites.push(request);
          return Promise.resolve({ text: request.response.text });
        },
      },
    });

    await assistant.handleText("Can you do");
    await expect(
      assistant.handleText("What are your capabilities?"),
    ).resolves.toEqual({ status: "ok", text: "I can help." });
    expect(rewrites).toEqual([
      expect.objectContaining({
        originalText: "What are your capabilities?",
      }),
    ]);
  });
});
