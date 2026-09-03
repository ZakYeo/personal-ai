import { readOperatorDiagnosticProjection } from "./operator-diagnostic.js";

describe("readOperatorDiagnosticProjection", () => {
  it("bounds command tails and preserves truncation metadata", () => {
    expect(
      readOperatorDiagnosticProjection({
        operatorDiagnostic: {
          exitCode: 12,
          kind: "command",
          stderr: { tail: `discard${"x".repeat(2_000)}`, truncated: false },
        },
      }),
    ).toEqual({
      exitCode: 12,
      kind: "command",
      stderr: { tail: "x".repeat(2_000), truncated: true },
    });
  });

  it("accepts only bounded safe provider metadata", () => {
    expect(
      readOperatorDiagnosticProjection({
        operatorDiagnostic: {
          kind: "provider",
          requestId: "request-123",
          responseBodyBytes: 42,
          status: 429,
        },
      }),
    ).toEqual({
      kind: "provider",
      requestId: "request-123",
      responseBodyBytes: 42,
      status: 429,
    });
    expect(
      readOperatorDiagnosticProjection({
        operatorDiagnostic: {
          kind: "provider",
          requestId: "forged\nlog line",
        },
      }),
    ).toBeUndefined();
  });

  it("ignores lookalike raw fields without the typed envelope", () => {
    expect(
      readOperatorDiagnosticProjection({
        responseBody: "private",
        status: 500,
        stderr: "private",
      }),
    ).toBeUndefined();
  });
});
