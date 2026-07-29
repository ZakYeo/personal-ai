import { interpretOnce } from "../../ports/intent.js";
import {
  createAbortingFetchStub,
  createFetchStub,
  createMissingProviderCredentialEnv,
  createProviderTransportFailureFetchStub,
  jsonResponse,
  malformedJsonResponse,
  providerErrorResponse,
} from "../../test-support/adapter-contract.js";
import type { OpenAIIntentError } from "./openai-intent-interpreter.js";
import {
  createOpenAIIntentInterpreter as createInterpreter,
  openAIIntentContext as context,
} from "../../test-support/openai-intent.js";

describe("OpenAIIntentInterpreter", () => {
  it("rejects missing API keys before calling the provider", async () => {
    const fetch = vi.fn();
    const interpreter = createInterpreter({
      env: createMissingProviderCredentialEnv(),
      fetch,
    });

    await expect(
      interpretOnce(interpreter, "Hey Jarvis, list my alarms", context),
    ).rejects.toThrow(
      "OpenAI API key environment variable OPENAI_API_KEY is not set.",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects non-2xx provider responses with status diagnostics", async () => {
    const interpreter = createInterpreter({
      fetch: createFetchStub(
        providerErrorResponse(
          429,
          { error: { message: "quota exceeded" } },
          "Too Many Requests",
        ),
      ),
    });

    await expect(
      interpretOnce(interpreter, "Hey Jarvis, list my alarms", context),
    ).rejects.toMatchObject({
      message: "OpenAI intent request failed with status 429.",
      responseBody: '{"error":{"message":"quota exceeded"}}',
      status: 429,
    } satisfies Partial<OpenAIIntentError>);
  });

  it("rejects provider response bodies that are not JSON with diagnostics", async () => {
    const interpreter = createInterpreter({
      fetch: createFetchStub(malformedJsonResponse("{not-json")),
    });

    await expect(
      interpretOnce(interpreter, "Hey Jarvis, list my alarms", context),
    ).rejects.toMatchObject({
      message: "OpenAI intent response body was not valid JSON.",
      responseBody: "{not-json",
      status: 200,
    } satisfies Partial<OpenAIIntentError>);
  });

  it("rejects malformed provider JSON output", async () => {
    const interpreter = createInterpreter({
      fetch: createFetchStub(
        jsonResponse({
          id: "response-1",
          output_text: "{not-json",
        }),
      ),
    });

    await expect(
      interpretOnce(interpreter, "Hey Jarvis, list my alarms", context),
    ).rejects.toThrow("OpenAI intent response was not valid JSON.");
  });

  it("rejects provider output that does not match intent shape", async () => {
    const interpreter = createInterpreter({
      fetch: createFetchStub(
        jsonResponse({
          id: "response-1",
          output_text: JSON.stringify({
            kind: "command",
            plan: null,
            command: {
              capability: "alarm.create",
              parameters: [{ name: "nested", value: { unsafe: true } }],
              rawText: "Hey Jarvis, set an alarm",
            },
            response: null,
          }),
        }),
      ),
    });

    await expect(
      interpretOnce(interpreter, "Hey Jarvis, set an alarm", context),
    ).rejects.toThrow(
      "OpenAI intent response parameters must be scalar values.",
    );
  });

  it("rejects duplicate command parameter names", async () => {
    const interpreter = createInterpreter({
      fetch: createFetchStub(
        jsonResponse({
          id: "response-1",
          output_text: JSON.stringify({
            kind: "command",
            plan: null,
            command: {
              capability: "alarm.create",
              parameters: [
                { name: "time", value: "07:00" },
                { name: "time", value: "08:00" },
              ],
              rawText: "Hey Jarvis, set an alarm",
            },
            response: null,
          }),
        }),
      ),
    });

    await expect(
      interpretOnce(interpreter, "Hey Jarvis, set an alarm", context),
    ).rejects.toThrow(
      'OpenAI intent response command.parameters contains duplicate name "time".',
    );
  });

  it("rejects transport failures without replacing the provider diagnostic", async () => {
    const error = new TypeError("network unavailable");
    const interpreter = createInterpreter({
      fetch: createProviderTransportFailureFetchStub(error),
    });

    await expect(
      interpretOnce(interpreter, "Hey Jarvis, list my alarms", context),
    ).rejects.toBe(error);
  });

  it("aborts requests that exceed the configured timeout", async () => {
    const fetch = createAbortingFetchStub();
    const interpreter = createInterpreter({
      fetch,
      timeoutMs: 1,
    });

    await expect(
      interpretOnce(interpreter, "Hey Jarvis, list my alarms", context),
    ).rejects.toThrow("OpenAI intent request timed out after 1ms.");
  });
});
