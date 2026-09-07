import type {
  AssistantCommand,
  AssistantOutcome,
  ClockPort,
} from "../../ports/assistant.js";
import type { CapabilityCatalog } from "../../ports/capability-catalog.js";
import type { IntentDraftSnapshot } from "../../ports/intent.js";
import { decodeCommandForCapability } from "./command-validation.js";
import { withinDraftParameterBudget } from "./draft-parameters.js";

interface DraftInput {
  capability: string;
  parameter?: string;
  partialCommand?: AssistantCommand;
}
type DraftStep = NonNullable<IntentDraftSnapshot["steps"]>[number];
interface DraftState {
  readonly steps: readonly DraftStep[];
  readonly selectedIndex: number;
  readonly prepared: boolean;
  readonly missingParameters: readonly string[];
  readonly references: readonly string[];
  readonly expiresAt: string;
}

export function createClarificationDraft(
  clock: ClockPort,
  catalog: CapabilityCatalog,
) {
  let createdAt: number | undefined;
  let replies = 0;
  let state: DraftState | undefined;
  const expired = () => {
    if (createdAt === undefined) return false;
    const elapsed = clock.now().getTime() - createdAt;
    return !Number.isFinite(elapsed) || elapsed < 0 || elapsed >= 300_000;
  };
  const selected = () => state?.steps[state.selectedIndex];
  return {
    expired,
    open(input: DraftInput, references: readonly string[]): boolean {
      const command = input.partialCommand ?? {
        capability: input.capability,
        parameters: {},
        rawText: "",
      };
      if (command.capability !== input.capability) return false;
      const step = decode({
        ...command,
        parameters: { ...selected()?.parameters, ...command.parameters },
      });
      return (
        step !== undefined &&
        install([step], references, false, input.parameter)
      );
    },
    openPlan(
      commands: readonly AssistantCommand[],
      references: readonly string[],
    ): boolean {
      if (commands.length < 1 || commands.length > 3) return false;
      const steps: DraftStep[] = [];
      for (const command of commands) {
        const step = decode(command);
        if (!step) return false;
        steps.push(step);
      }
      return install(steps, references, true);
    },
    takeReply(): boolean {
      if (!state || expired() || replies >= 3) return false;
      replies += 1;
      return true;
    },
    snapshot(): IntentDraftSnapshot {
      if (!state) throw new Error("No clarification draft is active.");
      const step = state.steps[state.selectedIndex]!;
      return Object.freeze({
        ...step,
        missingParameters: state.missingParameters,
        references: state.references,
        expiresAt: state.expiresAt,
        remainingReplies: 3 - replies,
        ...(state.prepared ? { steps: state.steps } : {}),
      });
    },
  };

  function decode(command: AssistantCommand): DraftStep | undefined {
    const capability = catalog.find(
      (entry) => entry.capability.name === command.capability,
    )?.capability;
    if (!capability) return;
    const decoded = decodeCommandForCapability(command, capability, {
      allowMissingRequired: true,
    });
    return decoded.ok
      ? Object.freeze({
          capability: command.capability,
          parameters: Object.freeze(decoded.args),
        })
      : undefined;
  }

  function install(
    steps: readonly DraftStep[],
    references: readonly string[],
    prepared: boolean,
    parameter?: string,
  ): boolean {
    if (
      expired() ||
      (!prepared && replies >= 3) ||
      !withinDraftParameterBudget(steps.map((step) => step.parameters))
    )
      return false;
    const previous = selected();
    const selectedIndex = previous
      ? steps.findIndex((step) => step.capability === previous.capability)
      : 0;
    if (selectedIndex < 0) return false;
    const step = steps[selectedIndex]!;
    const capability = catalog.find(
      (entry) => entry.capability.name === step.capability,
    )!.capability;
    const missing = Object.entries(capability.parameters ?? {})
      .filter(
        ([name, definition]) =>
          definition.required && step.parameters[name] == null,
      )
      .map(([name]) => name);
    if (parameter && !missing.includes(parameter)) missing.push(parameter);
    const start = createdAt ?? clock.now().getTime();
    if (!Number.isFinite(start)) return false;
    const next = Object.freeze({
      steps: Object.freeze([...steps]),
      selectedIndex,
      prepared,
      missingParameters: Object.freeze(missing),
      references: Object.freeze(references.slice(0, 10)),
      expiresAt: new Date(start + 300_000).toISOString(),
    });
    createdAt = start;
    state = next;
    return true;
  }
}

export const expiredDraftOutcome: AssistantOutcome = {
  response: {
    status: "unknown",
    text: "That draft expired. Please start the request again.",
  },
};
