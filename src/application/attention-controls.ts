import type {
  AttentionPreferences,
  AttentionStore,
} from "../ports/attention.js";
import { createAttentionPreferences } from "./attention-policy.js";
import { updateAttentionState } from "./attention-transaction.js";

export async function setAttentionBudget(
  store: AttentionStore,
  preferences: AttentionPreferences,
): Promise<void> {
  validateAttentionBudget(preferences);
  await updateAttentionState(store, (state) => ({
    result: undefined,
    state: { ...state, preferences: { ...preferences } },
  }));
}
export function validateAttentionBudget(
  preferences: AttentionPreferences,
): void {
  createAttentionPreferences(preferences.timeZone);
  if (
    !Number.isInteger(preferences.dailyBudget) ||
    preferences.dailyBudget < 1 ||
    preferences.dailyBudget > 20
  )
    throw new Error("Attention daily budget must be from 1 to 20.");
}
export async function disableAttentionFromItem(
  store: AttentionStore,
  selected: { id: string; expectedRevision: number },
  now: Date,
): Promise<boolean> {
  return updateAttentionState(store, (state) => {
    const item = state.inbox.find(
      (item) =>
        item.id === selected.id && item.revision === selected.expectedRevision,
    );
    if (!item) return { result: false };
    const rule = state.rules.find((rule) => rule.id === item.ruleId);
    if (!rule) return { result: false };
    return {
      result: true,
      state: {
        ...state,
        rules: state.rules.map((entry) =>
          entry.id === rule.id
            ? {
                ...entry,
                enabled: false,
                revision: entry.revision + 1,
                updatedAt: now.toISOString(),
              }
            : entry,
        ),
      },
    };
  });
}
