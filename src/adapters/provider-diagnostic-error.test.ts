import { ProviderDiagnosticError } from "./provider-diagnostic-error.js";

describe("ProviderDiagnosticError", () => {
  it("projects status, safe request ID, and UTF-8 response-body size", () => {
    const error = new TestProviderError("failed", 429, "£", {
      requestId: "request-123",
    });

    expect(error.operatorDiagnostic).toEqual({
      kind: "provider",
      requestId: "request-123",
      responseBodyBytes: 2,
      status: 429,
    });
    expect(error.responseBody).toBe("£");
  });

  it("omits unsafe request IDs without discarding other metadata", () => {
    const error = new TestProviderError("failed", 500, "private", {
      requestId: "request\nforged",
    });

    expect(error.operatorDiagnostic).toEqual({
      kind: "provider",
      responseBodyBytes: 7,
      status: 500,
    });
  });
});

class TestProviderError extends ProviderDiagnosticError {
  constructor(
    message: string,
    status?: number,
    responseBody?: string,
    options?: { requestId?: string },
  ) {
    super(message, status, responseBody, options);
  }
}
