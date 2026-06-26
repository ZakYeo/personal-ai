import type { AppError } from "../core/assistant/app-error.js";
import type { AssistantResponse } from "../ports/assistant.js";

interface HumanBoundaryIo {
  stderr?: { write(chunk: string): boolean | void };
}

export const safeRuntimeFallbackResponse: AssistantResponse = {
  status: "error",
  text: "I hit a problem and could not complete that.",
};

export function logFeatureDiagnostics(
  diagnostics: AppError[],
  io: HumanBoundaryIo,
): void {
  for (const diagnostic of diagnostics) {
    if (diagnostic.category === "feature_failure") {
      const capability = diagnostic.capability
        ? ` in ${diagnostic.capability}`
        : "";

      io.stderr?.write(`Feature failure${capability}: ${diagnostic.message}\n`);

      if (diagnostic.cause !== undefined) {
        io.stderr?.write(
          `Feature failure cause${capability}: ${formatDiagnosticCause(diagnostic.cause)}\n`,
        );
      }
    }
  }
}

export function logRuntimeFailure(error: unknown, io: HumanBoundaryIo): void {
  const message = error instanceof Error ? error.message : String(error);

  io.stderr?.write(`Runtime failure: ${message}\n`);

  for (const diagnostic of formatRuntimeDiagnosticFields(error)) {
    io.stderr?.write(diagnostic);
  }
}

function formatDiagnosticCause(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.stack ?? cause.message;
  }

  return String(cause);
}

function formatRuntimeDiagnosticFields(error: unknown): string[] {
  if (!isRecord(error)) {
    return [];
  }

  return [
    ...formatRuntimeDiagnosticField("stderr", error.stderr),
    ...formatRuntimeDiagnosticField("stdout", error.stdout),
  ];
}

function formatRuntimeDiagnosticField(
  label: "stderr" | "stdout",
  value: unknown,
): string[] {
  if (typeof value !== "string" || value.length === 0) {
    return [];
  }

  return [`Runtime failure ${label}: ${truncateDiagnostic(value.trim())}\n`];
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
