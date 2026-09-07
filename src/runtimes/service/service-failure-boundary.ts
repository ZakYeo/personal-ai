import { safeRuntimeFallbackResponse } from "../human-boundary.js";
import type { ServiceRuntimeResult } from "./service-runtime.js";

/** Preserves fatal runtime failures independently of diagnostic and shutdown IO. */
export function createServiceFailureBoundary(options: {
  failureReason: string;
  reportFailure(error: Error): void;
}) {
  let failed = false;
  let requestShutdown: ((reason: string) => void) | undefined;
  const shutdown = () => {
    try {
      requestShutdown?.(options.failureReason);
    } catch {
      /* The failed result remains authoritative. */
    }
  };
  return {
    bindShutdown(request: (reason: string) => void): void {
      requestShutdown = request;
      if (failed) shutdown();
    },
    report(error: Error): void {
      failed = true;
      shutdown();
      try {
        options.reportFailure(error);
      } catch {
        /* Diagnostic IO cannot turn failure into a clean stop. */
      }
    },
    finish(result: ServiceRuntimeResult): ServiceRuntimeResult {
      return failed
        ? { ...result, response: safeRuntimeFallbackResponse, status: "failed" }
        : result;
    },
  };
}
