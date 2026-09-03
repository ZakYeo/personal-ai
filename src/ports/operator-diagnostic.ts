export interface OperatorDiagnosticTextTail {
  readonly tail: string;
  readonly truncated: boolean;
}

export type OperatorDiagnosticProjection =
  | {
      readonly exitCode?: number | null;
      readonly kind: "command";
      readonly stderr?: OperatorDiagnosticTextTail;
      readonly stdout?: OperatorDiagnosticTextTail;
      readonly timeoutMs?: number;
    }
  | {
      readonly kind: "provider";
      readonly requestId?: string;
      readonly responseBodyBytes?: number;
      readonly status?: number;
    };
