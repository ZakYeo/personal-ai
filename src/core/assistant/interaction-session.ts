import { unexpectedOutcome } from "./assistant-outcome.js";
import type { AssistantOutcome, ClockPort } from "../../ports/assistant.js";
import type { ValidatedAssistantPlan } from "../../ports/assistant-plan.js";

export interface InteractionSession {
  requestConfirmation(
    plan: ValidatedAssistantPlan,
    prompt: AssistantOutcome,
    execute?: (
      plan: ValidatedAssistantPlan,
      signal?: AbortSignal,
    ) => Promise<AssistantOutcome>,
    revise?: PendingReplyHandler,
  ): AssistantOutcome;
  requestClarification(
    prompt: AssistantOutcome,
    resume: (
      reply: string,
      signal?: AbortSignal,
    ) => Promise<ClarificationResolution>,
  ): AssistantOutcome;
  run(
    input: string,
    handle: () => Promise<AssistantOutcome>,
    execute: (
      plan: ValidatedAssistantPlan,
      signal?: AbortSignal,
    ) => Promise<AssistantOutcome>,
    onCompleted: (
      outcome: AssistantOutcome,
    ) => AssistantOutcome | Promise<AssistantOutcome> | void,
    signal?: AbortSignal,
  ): Promise<AssistantOutcome>;
}

export type ClarificationResolution =
  | { kind: "completed"; outcome: AssistantOutcome }
  | { kind: "unchanged" }
  | { kind: "replacement" };

type PendingReplyHandler = (
  reply: string,
  signal?: AbortSignal,
) => Promise<ClarificationResolution>;

type PendingInteraction =
  | {
      kind: "confirmation";
      createdAt: number;
      plan: ValidatedAssistantPlan;
      prompt: AssistantOutcome;
      revise?: PendingReplyHandler;
      execute?: (
        plan: ValidatedAssistantPlan,
        signal?: AbortSignal,
      ) => Promise<AssistantOutcome>;
    }
  | {
      kind: "clarification";
      prompt: AssistantOutcome;
      resume: (
        reply: string,
        signal?: AbortSignal,
      ) => Promise<ClarificationResolution>;
    };

export function createInteractionSession(clock: ClockPort): InteractionSession {
  let pending: PendingInteraction | undefined;
  let confirmationExpired = false;
  let queue = Promise.resolve();

  return {
    requestConfirmation(plan, prompt, execute, revise) {
      confirmationExpired = false;
      pending = {
        kind: "confirmation",
        createdAt: clock.now().getTime(),
        plan,
        prompt,
        ...(execute ? { execute } : {}),
        ...(revise ? { revise } : {}),
      };
      return prompt;
    },
    requestClarification(prompt, resume) {
      confirmationExpired = false;
      pending = { kind: "clarification", prompt, resume };
      return prompt;
    },
    run(input, handle, execute, onCompleted, signal) {
      const turn = queue.then(async () => {
        if (signal?.aborted) return unexpectedOutcome(signal.reason as unknown);
        const complete = async (outcome: AssistantOutcome) =>
          (await onCompleted(outcome)) ?? outcome;
        let outcome: AssistantOutcome;
        if (pending?.kind === "confirmation") {
          const elapsed = clock.now().getTime() - pending.createdAt;
          if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed >= 120_000) {
            pending = undefined;
            confirmationExpired = true;
            return complete(expiredConfirmationOutcome);
          }
        }
        if (!pending) {
          if (confirmationExpired && parseConfirmation(input) !== "pending")
            return complete(expiredConfirmationOutcome);
          confirmationExpired = false;
          outcome = await handle();
          return complete(outcome);
        }

        if (pending.kind === "clarification") {
          if (isCancellation(input)) {
            pending = undefined;
            outcome = cancelledOutcome;
          } else {
            const original = pending;
            const resume = pending.resume;
            pending = undefined;
            const resolution = await resume(input, signal);
            if (resolution.kind === "unchanged") {
              pending = original;
              outcome = original.prompt;
            } else
              outcome =
                resolution.kind === "replacement"
                  ? await handle()
                  : resolution.outcome;
          }
          return complete(outcome);
        }

        const decision = parseConfirmation(input);
        if (decision === "pending") {
          if (pending.revise) {
            const original = pending;
            const revise = pending.revise;
            pending = undefined;
            const resolution = await revise(input, signal);
            if (resolution.kind === "unchanged") {
              pending = original;
              outcome = original.prompt;
            } else
              outcome =
                resolution.kind === "replacement"
                  ? await handle()
                  : resolution.outcome;
          } else outcome = pending.prompt;
          return complete(outcome);
        }

        const { execute: executePending, plan } = pending;
        pending = undefined;
        outcome =
          decision === "confirmed"
            ? await (executePending ?? execute)(plan, signal)
            : cancelledOutcome;
        return complete(outcome);
      });

      queue = turn.then(
        () => {},
        () => {},
      );
      return turn;
    },
  };
}

function parseConfirmation(
  input: string,
): "confirmed" | "rejected" | "pending" {
  const normalized = normalizeDecision(input);
  if (
    [
      "yes",
      "yes please",
      "yes confirm that",
      "confirm",
      "confirm that",
      "confirmed",
    ].includes(normalized)
  ) {
    return "confirmed";
  }
  if (isCancellation(input)) return "rejected";
  return "pending";
}

function isCancellation(input: string): boolean {
  return ["no", "no thanks", "cancel", "stop"].includes(
    normalizeDecision(input),
  );
}

function normalizeDecision(input: string): string {
  return input
    .trim()
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const cancelledOutcome: AssistantOutcome = {
  response: { status: "ok", text: "Okay, I did not do that." },
};

const expiredConfirmationOutcome: AssistantOutcome = {
  response: {
    status: "ok",
    text: "That confirmation expired. Please ask me to prepare the action again.",
  },
};
