import type {
  AssistantCommand,
  AssistantOutcome,
  ClockPort,
} from "../../ports/assistant.js";
import type { CapabilityCatalog } from "../../ports/capability-catalog.js";
import type { IntentDraftSnapshot } from "../../ports/intent.js";
import { decodeCommandForCapability } from "./command-validation.js";

export function createClarificationDraft(
  clock: ClockPort,
  catalog: CapabilityCatalog,
) {
  let createdAt: number | undefined;
  let replies = 0;
  let state: Omit<IntentDraftSnapshot, "remainingReplies"> | undefined;
  const expired = () => {
    if (createdAt === undefined) return false;
    const elapsed = clock.now().getTime() - createdAt;
    return !Number.isFinite(elapsed) || elapsed < 0 || elapsed >= 300_000;
  };
  return {
    expired,
    open(
      input: {
        capability: string;
        parameter?: string;
        partialCommand?: AssistantCommand;
      },
      references: readonly string[],
    ): boolean {
      if (
        expired() ||
        replies >= 3 ||
        (state && state.capability !== input.capability)
      )
        return false;
      createdAt ??= clock.now().getTime();
      if (expired()) return false;
      const capability = catalog.find(
        (entry) => entry.capability.name === input.capability,
      )?.capability;
      let parameters = state?.parameters ?? {};
      if (input.partialCommand) {
        if (!capability) return false;
        const decoded = decodeCommandForCapability(
          input.partialCommand,
          capability,
          { allowMissingRequired: true },
        );
        if (!decoded.ok) return false;
        parameters = decoded.args;
      }
      const missing = Object.entries(capability?.parameters ?? {})
        .filter(
          ([name, definition]) =>
            definition.required && parameters[name] == null,
        )
        .map(([name]) => name);
      if (input.parameter && !missing.includes(input.parameter))
        missing.push(input.parameter);
      state = Object.freeze({
        capability: input.capability,
        parameters: Object.freeze({ ...parameters }),
        missingParameters: Object.freeze(missing),
        references: Object.freeze(references.slice(0, 10)),
        expiresAt: new Date(createdAt + 300_000).toISOString(),
      });
      return true;
    },
    takeReply(): boolean {
      if (!state || expired() || replies >= 3) return false;
      replies += 1;
      return true;
    },
    snapshot(): IntentDraftSnapshot {
      if (!state) throw new Error("No clarification draft is active.");
      return Object.freeze({ ...state, remainingReplies: 3 - replies });
    },
  };
}

export const expiredDraftOutcome: AssistantOutcome = {
  response: {
    status: "unknown",
    text: "That draft expired. Please start the request again.",
  },
};
