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
}

function formatDiagnosticCause(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.stack ?? cause.message;
  }

  return String(cause);
}
