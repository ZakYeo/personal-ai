import { createCapturedWriter } from "../test-support/primitives.js";
import { logAssistantDiagnostics } from "./human-boundary.js";

describe("assistant diagnostic logging", () => {
  it("logs every preserved diagnostic category with safe labels and causes", () => {
    const stderr = createCapturedWriter();

    logAssistantDiagnostics(
      [
        { category: "validation", message: "invalid input" },
        {
          category: "confirmation_required",
          message: "confirmation needed",
        },
        { category: "unsupported", message: "not supported" },
        {
          capability: "calendar.search",
          category: "feature_failure",
          cause: new Error("calendar adapter failed"),
          message: "feature failed",
        },
        {
          category: "response_rewrite_failure",
          cause: "rewriter transport failed",
          message: "rewrite failed",
        },
        {
          category: "conversation_failure",
          cause: "conversation transport failed",
          message: "conversation failed",
        },
        { category: "unexpected", message: "unexpected failure" },
      ],
      { stderr },
    );

    expect(stderr.writes).toEqual([
      "Validation diagnostic: invalid input\n",
      "Confirmation required diagnostic: confirmation needed\n",
      "Unsupported diagnostic: not supported\n",
      "Feature failure in calendar.search: feature failed\n",
      expect.stringContaining(
        "Feature failure cause in calendar.search: Error: calendar adapter failed",
      ),
      "Response rewrite failure: rewrite failed\n",
      "Response rewrite failure cause: rewriter transport failed\n",
      "Conversation failure: conversation failed\n",
      "Conversation failure cause: conversation transport failed\n",
      "Unexpected assistant failure: unexpected failure\n",
    ]);
  });

  it("logs bounded provider fields from assistant diagnostic causes", () => {
    const stderr = createCapturedWriter();
    const responseBody = `provider details ${"x".repeat(2_100)}`;
    const providerError = Object.assign(new Error("OpenAI intent failed."), {
      responseBody,
      status: 400,
    });

    logAssistantDiagnostics(
      [
        {
          category: "unexpected",
          cause: providerError,
          message: "OpenAI intent request failed with status 400.",
        },
      ],
      { stderr },
    );

    expect(stderr.writes).toEqual([
      "Unexpected assistant failure: OpenAI intent request failed with status 400.\n",
      expect.stringContaining(
        "Unexpected assistant failure cause: Error: OpenAI intent failed.",
      ),
      "Unexpected assistant failure cause status: 400\n",
      `Unexpected assistant failure cause response body: ${responseBody.slice(0, 2_000)}...\n`,
    ]);
  });
});
