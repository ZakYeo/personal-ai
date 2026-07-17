import { parseOpenAIIntentSessionResponse } from "./openai-intent-session-response.js";
import type { OpenAIIntentCapability } from "./openai-intent-request.js";

const capability: OpenAIIntentCapability = {
  capability: {
    name: "calendar.search_events",
    parameters: { query: { type: "string" } },
    risk: "low",
    toolChain: "read",
  },
  featureId: "calendar",
  featureName: "Calendar",
  parameterText: "query: string (optional)",
};
const tools = new Map([["read_0", capability]]);

describe("parseOpenAIIntentSessionResponse", () => {
  it("parses a resumable clarification", () => {
    expect(
      parseOpenAIIntentSessionResponse(
        {
          id: "response-1",
          output_text: JSON.stringify({
            command: null,
            kind: "clarification",
            plan: null,
            response: { status: "ok", text: "What time should I use?" },
          }),
        },
        tools,
        "remind me before the event",
      ),
    ).toEqual({
      interpretation: {
        kind: "clarification",
        response: { status: "ok", text: "What time should I use?" },
      },
      responseId: "response-1",
    });
  });

  it("rejects multiple function calls in one provider response", () => {
    expect(() =>
      parseOpenAIIntentSessionResponse(
        {
          id: "response-1",
          output: [functionCall("call-1"), functionCall("call-2")],
        },
        tools,
        "search twice",
      ),
    ).toThrow("must contain at most one function call");
  });

  it("rejects mixed function-call and terminal output", () => {
    expect(() =>
      parseOpenAIIntentSessionResponse(
        {
          id: "response-1",
          output: [functionCall("call-1")],
          output_text: "{}",
        },
        tools,
        "search",
      ),
    ).toThrow("must not mix function calls with terminal output");
  });

  it("rejects undeclared tool arguments", () => {
    expect(() =>
      parseOpenAIIntentSessionResponse(
        {
          id: "response-1",
          output: [
            {
              ...functionCall("call-1"),
              arguments: '{"privateTarget":"secret"}',
            },
          ],
        },
        tools,
        "search",
      ),
    ).toThrow('contain unknown parameter "privateTarget"');
  });
});

function functionCall(callId: string) {
  return {
    arguments: '{"query":"dentist"}',
    call_id: callId,
    name: "read_0",
    type: "function_call",
  };
}
