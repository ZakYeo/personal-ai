import type {
  AssistantDiagnostic,
  AssistantDiagnosticCategory,
  AssistantResponse,
} from "../ports/assistant.js";
import {
  quoteOperatorDiagnosticString,
  readOperatorDiagnosticProjection,
} from "../application/operator-diagnostic.js";

interface HumanBoundaryIo {
  stderr?: { write(chunk: string): boolean | void };
}

export const safeRuntimeFallbackResponse: AssistantResponse = {
  status: "error",
  text: "I hit a problem and could not complete that.",
};

const assistantDiagnosticLabels: Record<AssistantDiagnosticCategory, string> = {
  confirmation_required: "Confirmation required diagnostic",
  conversation_failure: "Conversation failure",
  feature_failure: "Feature failure",
  personalization_failure: "Personalization failure",
  response_rewrite_failure: "Response rewrite failure",
  unexpected: "Unexpected assistant failure",
  unsupported: "Unsupported diagnostic",
  validation: "Validation diagnostic",
};

export function logAssistantDiagnostics(
  diagnostics: AssistantDiagnostic[],
  io: HumanBoundaryIo,
): void {
  for (const diagnostic of diagnostics) {
    const label = assistantDiagnosticLabels[diagnostic.category];
    const capability = diagnostic.capability
      ? ` in ${diagnostic.capability}`
      : "";

    io.stderr?.write(`${label}${capability}: ${diagnostic.message}\n`);

    if (diagnostic.cause !== undefined) {
      const causePrefix = `${label} cause${capability}`;
      io.stderr?.write(
        `${causePrefix}: ${formatDiagnosticCause(diagnostic.cause)}\n`,
      );
      for (const causeDiagnostic of formatAssistantDiagnosticFields(
        diagnostic.cause,
        causePrefix,
      )) {
        io.stderr?.write(causeDiagnostic);
      }
    }
  }
}

export function logRuntimeFailure(error: unknown, io: HumanBoundaryIo): void {
  const message = error instanceof Error ? error.message : String(error);

  io.stderr?.write(`Runtime failure: ${message}\n`);

  for (const diagnostic of formatDiagnosticFields(error, "Runtime failure")) {
    io.stderr?.write(diagnostic);
  }
}

function formatDiagnosticCause(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.stack ?? cause.message;
  }

  return String(cause);
}

function formatAssistantDiagnosticFields(
  error: unknown,
  prefix: string,
): string[] {
  return formatDiagnosticFields(error, prefix);
}

function formatDiagnosticFields(error: unknown, prefix: string): string[] {
  const projection = readOperatorDiagnosticProjection(error);
  if (!projection) return [];
  if (projection.kind === "provider") {
    return [
      ...(projection.status === undefined
        ? []
        : [`${prefix} provider status: ${projection.status}\n`]),
      ...(projection.requestId
        ? [
            `${prefix} provider request ID: ${quoteOperatorDiagnosticString(projection.requestId)}\n`,
          ]
        : []),
      ...(projection.responseBodyBytes === undefined
        ? []
        : [
            `${prefix} provider response body bytes: ${projection.responseBodyBytes}\n`,
          ]),
    ];
  }
  return [
    ...(projection.exitCode === undefined
      ? []
      : [`${prefix} command exit code: ${String(projection.exitCode)}\n`]),
    ...(projection.timeoutMs === undefined
      ? []
      : [`${prefix} command timeout milliseconds: ${projection.timeoutMs}\n`]),
    ...formatCommandTail(prefix, "stderr", projection.stderr),
    ...formatCommandTail(prefix, "stdout", projection.stdout),
  ];
}

function formatCommandTail(
  prefix: string,
  label: "stderr" | "stdout",
  output: { readonly tail: string; readonly truncated: boolean } | undefined,
): string[] {
  if (!output || output.tail.length === 0) return [];
  const truncation = output.truncated ? " (truncated)" : "";
  return [
    `${prefix} command ${label} tail${truncation}: ${quoteOperatorDiagnosticString(output.tail)}\n`,
  ];
}
