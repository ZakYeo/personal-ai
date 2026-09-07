import { describeAttentionProblem } from "./attention-problem-state.js";
import type { AttentionState, AttentionInboxItem } from "../ports/attention.js";
import type { TaskRecord } from "../ports/task-store.js";
import { renderSpokenFact } from "./human-text.js";

/** Attribute all snapshot wording, including source-authored relative phrases, to its capture instant. */
function renderAttentionHistory(
  item: AttentionInboxItem,
  bodyLimit = 800,
): string {
  const recorded = renderSpokenFact(item.observedAt, {
    now: new Date(item.observedAt),
    timeZone: item.timeZone,
    assistantTimeZone: item.timeZone,
    dateStyle: "absolute",
  });
  const body =
    item.text.length <= bodyLimit
      ? item.text
      : `${item.text.slice(0, bodyLimit - 1).trimEnd()}…`;
  return `Recorded at ${recorded}: ${body}`;
}

export function presentAttentionNotice(
  item: AttentionInboxItem,
  state: Pick<AttentionState, "rules" | "evaluations">,
  tasks: readonly TaskRecord[] | undefined,
  bodyLimit = 700,
) {
  const problem = describeAttentionProblem(item, state, tasks);
  return {
    text: `${renderAttentionHistory(item, bodyLimit)}${problem.text ? ` ${problem.text}` : ""}`,
    canResolveReminder: problem.canResolveReminder,
  };
}
