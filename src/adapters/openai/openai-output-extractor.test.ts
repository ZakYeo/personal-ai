import { extractOpenAIOutputText } from "./openai-output-extractor.js";

describe("extractOpenAIOutputText", () => {
  it("accepts extracted model output at the application text limit", () => {
    const text = "a".repeat(16_000);

    expect(
      extractOpenAIOutputText(
        { output_text: text },
        {
          createError: (message) => new Error(message),
          missingMessage: "missing output",
          notObjectMessage: "invalid response",
        },
      ),
    ).toBe(text);
  });

  it("rejects extracted model output above the application text limit", () => {
    expect(() =>
      extractOpenAIOutputText(
        { output_text: "a".repeat(16_001) },
        {
          createError: (message) => new Error(message),
          missingMessage: "missing output",
          notObjectMessage: "invalid response",
        },
      ),
    ).toThrow("OpenAI model output text exceeded the application limit.");
  });
});
