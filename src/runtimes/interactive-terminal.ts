import type { Interface } from "node:readline/promises";
import { awaitAbortableOperation } from "./abortable-operation.js";

interface TerminalProcessSignals {
  once(event: "SIGINT" | "SIGTERM", listener: () => void): unknown;
  removeListener(event: "SIGINT" | "SIGTERM", listener: () => void): unknown;
}

/** Readline consumes terminal Ctrl-C; it must share process cancellation. */
export function createInteractiveTerminal(options: {
  questions: Pick<Interface, "question" | "on" | "removeListener" | "close">;
  processSignals: TerminalProcessSignals;
}) {
  const controller = new AbortController();
  const stop = () =>
    controller.abort(new Error("Interactive session cancelled."));
  let disposed = false;
  options.questions.on("SIGINT", stop);
  options.questions.on("close", stop);
  options.processSignals.once("SIGINT", stop);
  options.processSignals.once("SIGTERM", stop);
  return Object.freeze({
    signal: controller.signal,
    question: (prompt: string): Promise<string> => {
      controller.signal.throwIfAborted();
      return awaitAbortableOperation(
        options.questions.question(prompt, { signal: controller.signal }),
        controller.signal,
      );
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      stop();
      options.questions.removeListener("SIGINT", stop);
      options.questions.removeListener("close", stop);
      options.processSignals.removeListener("SIGINT", stop);
      options.processSignals.removeListener("SIGTERM", stop);
      options.questions.close();
    },
  });
}
