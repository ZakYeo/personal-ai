import type { OperatorDiagnosticProjection } from "../ports/operator-diagnostic.js";

export interface ProviderDiagnosticErrorOptions extends ErrorOptions {
  requestId?: string;
}

export abstract class ProviderDiagnosticError extends Error {
  readonly operatorDiagnostic: OperatorDiagnosticProjection;

  protected constructor(
    message: string,
    readonly status?: number,
    readonly responseBody?: string,
    options?: ProviderDiagnosticErrorOptions,
  ) {
    super(message, options);
    const requestId = safeRequestId(options?.requestId);
    this.operatorDiagnostic = Object.freeze({
      kind: "provider" as const,
      ...(requestId ? { requestId } : {}),
      ...(responseBody === undefined
        ? {}
        : {
            responseBodyBytes: new TextEncoder().encode(responseBody)
              .byteLength,
          }),
      ...(status === undefined ? {} : { status }),
    });
  }
}

function safeRequestId(value: string | undefined): string | undefined {
  return value && value.length <= 256 && /^[\x20-\x7e]+$/u.test(value)
    ? value
    : undefined;
}
