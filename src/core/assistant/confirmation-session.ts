import type { AssistantOutcome } from "../../ports/assistant.js";

export interface ConfirmationSession {
  request(execute: () => Promise<AssistantOutcome>): AssistantOutcome;
  run(
    input: string,
    handle: () => Promise<AssistantOutcome>,
  ): Promise<AssistantOutcome>;
}

export function createConfirmationSession(): ConfirmationSession {
  let pending: (() => Promise<AssistantOutcome>) | undefined;
  let queue = Promise.resolve();

  return {
    request(execute) {
      pending = execute;

      return confirmationPrompt;
    },
    run(input, handle) {
      const turn = queue.then(() => {
        if (!pending) {
          return handle();
        }

        const decision = parseConfirmation(input);

        if (decision === "pending") {
          return confirmationPrompt;
        }

        const execute = pending;
        pending = undefined;

        return decision === "confirmed" ? execute() : cancelledOutcome;
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

const confirmationPrompt: AssistantOutcome = {
  response: {
    expectsFollowUp: true,
    status: "needs_confirmation",
    text: "I need confirmation before doing that. Please confirm yes or no.",
  },
};

const cancelledOutcome: AssistantOutcome = {
  response: {
    status: "ok",
    text: "Okay, I did not do that.",
  },
};
