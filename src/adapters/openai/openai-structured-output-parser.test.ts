import { parseOpenAIStructuredOutput } from "./openai-structured-output-parser.js";

describe("parseOpenAIStructuredOutput", () => {
  it("parses structured output JSON from unknown data", () => {
    expect(
      parseOpenAIStructuredOutput('{"text":"hello"}', {
        createError: ({ message }) => new Error(message),
        invalidJsonMessage: "invalid output",
      }),
    ).toEqual({ text: "hello" });
  });

  it("preserves raw output and parse cause through caller errors", () => {
    let observed:
      | { cause: unknown; message: string; responseBody: string }
      | undefined;
    const createError = vi.fn(
      (options: { cause: unknown; message: string; responseBody: string }) => {
        observed = options;

        return new TypeError(options.message);
      },
    );

    expect(() =>
      parseOpenAIStructuredOutput("{invalid", {
        createError,
        invalidJsonMessage: "invalid output",
      }),
    ).toThrow(new TypeError("invalid output"));
    expect(observed).toMatchObject({
      message: "invalid output",
      responseBody: "{invalid",
    });
    expect(observed?.cause).toBeInstanceOf(SyntaxError);
  });
});
