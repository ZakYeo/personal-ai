import type { AssistantOutcome } from "../../ports/assistant.js";
import type { ValidatedAssistantPlan } from "../../ports/assistant-plan.js";

export interface InteractionSession {
  requestConfirmation(
    plan: ValidatedAssistantPlan,
    prompt: AssistantOutcome,
  ): AssistantOutcome;
  requestClarification(
    prompt: AssistantOutcome,
    resume: (reply: string) => Promise<AssistantOutcome>,
  ): AssistantOutcome;
  run(
    input: string,
    handle: () => Promise<AssistantOutcome>,
    execute: (plan: ValidatedAssistantPlan) => Promise<AssistantOutcome>,
    onCompleted: () => void,
  ): Promise<AssistantOutcome>;
}

type PendingInteraction =
  | {
      kind: "confirmation";
      plan: ValidatedAssistantPlan;
      prompt: AssistantOutcome;
    }
  | {
      kind: "clarification";
      prompt: AssistantOutcome;
      resume: (reply: string) => Promise<AssistantOutcome>;
    };

export function createInteractionSession(): InteractionSession {
  let pending: PendingInteraction | undefined;
  let queue = Promise.resolve();

  return {
    requestConfirmation(plan, prompt) {
      pending = { kind: "confirmation", plan, prompt };
      return prompt;
    },
    requestClarification(prompt, resume) {
      pending = { kind: "clarification", prompt, resume };
      return prompt;
    },
    run(input, handle, execute, onCompleted) {
      const turn = queue.then(async () => {
        let outcome: AssistantOutcome;
        if (!pending) {
          outcome = await handle();
          onCompleted();
          return outcome;
        }

        if (pending.kind === "clarification") {
          if (isCancellation(input)) {
            pending = undefined;
            outcome = cancelledOutcome;
          } else {
            const resume = pending.resume;
            pending = undefined;
            outcome = await resume(input);
          }
          onCompleted();
          return outcome;
        }

        const decision = parseConfirmation(input);
        if (decision === "pending") {
          outcome = pending.prompt;
          onCompleted();
          return outcome;
        }

        const plan = pending.plan;
        pending = undefined;
        outcome =
          decision === "confirmed" ? await execute(plan) : cancelledOutcome;
        onCompleted();
        return outcome;
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
  const normalized = input.trim().toLowerCase();
  if (["yes", "yes please", "confirm", "confirmed"].includes(normalized)) {
    return "confirmed";
  }
  if (isCancellation(input)) return "rejected";
  return "pending";
}

function isCancellation(input: string): boolean {
  return ["no", "no thanks", "cancel", "stop"].includes(
    input.trim().toLowerCase(),
  );
}

const cancelledOutcome: AssistantOutcome = {
  response: { status: "ok", text: "Okay, I did not do that." },
};
