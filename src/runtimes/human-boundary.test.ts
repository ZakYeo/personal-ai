import { createCapturedWriter } from "../test-support/primitives.js";
import { CommandExecutionError } from "../adapters/desktop/command-process.js";
import { OpenAIIntentError } from "../adapters/openai/openai-intent-error.js";
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

  it("ignores reflective raw fields without a typed diagnostic projection", () => {
    const stderr = createCapturedWriter();
    const providerError = Object.assign(new Error("OpenAI intent failed."), {
      event: { detail: "private event payload" },
      responseBody: "provider secret\ninjected log line",
      status: 400,
      stderr: "private command stderr",
      stdout: "private command stdout",
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
    ]);
    expect(stderr.writes.join("")).not.toMatch(
      /provider secret|injected log line|private event payload|private command stderr|private command stdout/u,
    );
  });

  it("logs typed command tails and safe provider metadata", () => {
    const stderr = createCapturedWriter();
    const commandError = new CommandExecutionError("command failed", 12, {
      stderr: "first line\ninjected line",
      stderrTruncated: false,
      stdout: "partial output",
      stdoutTruncated: true,
    });
    const providerError = new OpenAIIntentError(
      "provider failed",
      429,
      '{"private":"body"}',
      { requestId: "request-123" },
    );

    logAssistantDiagnostics(
      [
        {
          category: "feature_failure",
          cause: commandError,
          message: "command failed",
        },
        {
          category: "unexpected",
          cause: providerError,
          message: "provider failed",
        },
      ],
      { stderr },
    );

    expect(stderr.writes).toEqual([
      "Feature failure: command failed\n",
      expect.stringContaining(
        "Feature failure cause: CommandExecutionError: command failed",
      ),
      "Feature failure cause command exit code: 12\n",
      'Feature failure cause command stderr tail: "first line\\ninjected line"\n',
      'Feature failure cause command stdout tail (truncated): "partial output"\n',
      "Unexpected assistant failure: provider failed\n",
      expect.stringContaining(
        "Unexpected assistant failure cause: OpenAIIntentError: provider failed",
      ),
      "Unexpected assistant failure cause provider status: 429\n",
      'Unexpected assistant failure cause provider request ID: "request-123"\n',
      "Unexpected assistant failure cause provider response body bytes: 18\n",
    ]);
    expect(stderr.writes.join("")).not.toContain('{"private":"body"}');
  });

  it("escapes Unicode line controls in approved diagnostic strings", () => {
    const stderr = createCapturedWriter();
    const projectedError = Object.assign(new Error("projected failure"), {
      operatorDiagnostic: {
        kind: "command",
        stderr: {
          tail: "before\u0085middle\u2028next\u2029after",
          truncated: false,
        },
      },
    });
    const providerError = Object.assign(new Error("provider failure"), {
      operatorDiagnostic: {
        kind: "provider",
        requestId: "request\u2028middle\u2029end",
      },
    });

    logAssistantDiagnostics(
      [
        {
          category: "feature_failure",
          cause: projectedError,
          message: "command failed",
        },
        {
          category: "unexpected",
          cause: providerError,
          message: "provider failed",
        },
      ],
      { stderr },
    );

    expect(stderr.writes).toContain(
      'Feature failure cause command stderr tail: "before\\u0085middle\\u2028next\\u2029after"\n',
    );
    expect(stderr.writes).toContain(
      'Unexpected assistant failure cause provider request ID: "request\\u2028middle\\u2029end"\n',
    );
  });
});
