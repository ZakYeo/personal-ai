import type {
  AssistantDiagnostic,
  AssistantDiagnosticCategory,
  AssistantResponse,
} from "../ports/assistant.js";

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
      for (const causeDiagnostic of formatDiagnosticFields(
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

function formatDiagnosticFields(error: unknown, prefix: string): string[] {
  if (!isRecord(error)) {
    return [];
  }

  return [
    ...formatDiagnosticNumberField(prefix, "status", error.status),
    ...formatDiagnosticField(prefix, "response body", error.responseBody),
    ...formatDiagnosticJsonField(prefix, "event", error.event),
    ...formatDiagnosticField(prefix, "stderr", error.stderr),
    ...formatDiagnosticField(prefix, "stdout", error.stdout),
  ];
}

function formatDiagnosticNumberField(
  prefix: string,
  label: string,
  value: unknown,
): string[] {
  if (typeof value !== "number") {
    return [];
  }

  return [`${prefix} ${label}: ${value}\n`];
}

function formatDiagnosticJsonField(
  prefix: string,
  label: string,
  value: unknown,
): string[] {
  if (value === undefined) {
    return [];
  }

  return [
    `${prefix} ${label}: ${truncateDiagnostic(formatDiagnosticJson(value))}\n`,
  ];
}

function formatDiagnosticJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return "[unserializable diagnostic]";
  }
}

function formatDiagnosticField(
  prefix: string,
  label: "response body" | "stderr" | "stdout",
  value: unknown,
): string[] {
  if (typeof value !== "string" || value.length === 0) {
    return [];
  }

  return [`${prefix} ${label}: ${truncateDiagnostic(value.trim())}\n`];
}

function truncateDiagnostic(value: string): string {
  const maxDiagnosticLength = 2000;

  if (value.length <= maxDiagnosticLength) {
    return value;
  }

  return `${value.slice(0, maxDiagnosticLength)}...`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
