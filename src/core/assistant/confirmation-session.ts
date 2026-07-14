import type { AssistantOutcome } from "../../ports/assistant.js";
import type { ValidatedAssistantPlan } from "../../ports/assistant-plan.js";

export interface ConfirmationSession {
  request(
    plan: ValidatedAssistantPlan,
    prompt: AssistantOutcome,
  ): AssistantOutcome;
  run(
    input: string,
    handle: () => Promise<AssistantOutcome>,
    execute: (plan: ValidatedAssistantPlan) => Promise<AssistantOutcome>,
  ): Promise<AssistantOutcome>;
}

export function createConfirmationSession(): ConfirmationSession {
  let pending:
    | { plan: ValidatedAssistantPlan; prompt: AssistantOutcome }
    | undefined;
  let queue = Promise.resolve();

  return {
    request(plan, prompt) {
      pending = { plan, prompt };

      return prompt;
    },
    run(input, handle, execute) {
      const turn = queue.then(() => {
        if (!pending) {
          return handle();
        }

        const decision = parseConfirmation(input);

        if (decision === "pending") {
          return pending.prompt;
        }

        const plan = pending.plan;
        pending = undefined;

        return decision === "confirmed" ? execute(plan) : cancelledOutcome;
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

  if (["no", "no thanks", "cancel", "stop"].includes(normalized)) {
    return "rejected";
  }

  return "pending";
}

const cancelledOutcome: AssistantOutcome = {
  response: {
    status: "ok",
    text: "Okay, I did not do that.",
  },
};
