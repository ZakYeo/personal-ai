import type {
  AttentionInboxItem,
  AttentionRule,
  AttentionStore,
} from "../ports/attention.js";
import {
  attentionSnoozeUntil,
  normalizeAttentionRuleInput,
  type NewAttentionRuleInput,
} from "./attention-rule-policy.js";
import { updateAttentionState } from "./attention-transaction.js";

export function enableAttentionRule(
  store: AttentionStore,
  proposed: NewAttentionRuleInput,
  now: Date,
): Promise<AttentionRule> {
  const input = normalizeAttentionRuleInput(proposed);
  const timestamp = now.toISOString();
  return updateAttentionState(store, (state) => {
    const previous = state.rules.find(
      (rule) =>
        rule.name.toLocaleLowerCase() === input.name.toLocaleLowerCase(),
    );
    if (!previous && state.rules.length >= 24)
      throw new Error("Attention supports at most 24 saved rules.");
    if (
      input.definition.kind === "morning_routine" &&
      state.rules.some(
        (rule) =>
          rule.enabled &&
          rule.definition.kind === "morning_routine" &&
          rule.id !== previous?.id,
      )
    )
      throw new Error(
        "Disable the existing morning routine before enabling another.",
      );
    const rule: AttentionRule = {
      id: previous?.id ?? `attention-rule-${state.nextId}`,
      name: input.name,
      definition: input.definition,
      enabled: true,
      timeZone: input.timeZone,
      quietHours: input.quietHours,
      cooldownMinutes: input.cooldownMinutes,
      provenance: {
        kind: "user_authored",
        request: input.request,
        recordedAt: timestamp,
      },
      revision: (previous?.revision ?? 0) + 1,
      createdAt: previous?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    return {
      result: rule,
      state: {
        ...state,
        nextId: state.nextId + (previous ? 0 : 1),
        rules: previous
          ? state.rules.map((entry) =>
              entry.id === previous.id ? rule : entry,
            )
          : [...state.rules, rule],
      },
    };
  });
}

type RuleChange = { readonly id: string; readonly expectedRevision: number } & (
  | { readonly action: "disable" }
  | { readonly action: "snooze"; readonly minutes: number }
);

export function changeAttentionRule(
  store: AttentionStore,
  change: RuleChange,
  now: Date,
): Promise<AttentionRule | undefined> {
  const snoozedUntil =
    change.action === "snooze"
      ? attentionSnoozeUntil(now, change.minutes)
      : undefined;
  return updateAttentionState<AttentionRule | undefined>(store, (state) => {
    const previous = state.rules.find((rule) => rule.id === change.id);
    if (!previous || previous.revision !== change.expectedRevision)
      return { result: undefined };
    const rule: AttentionRule = {
      ...previous,
      ...(change.action === "disable"
        ? { enabled: false }
        : { snoozedUntil: snoozedUntil! }),
      revision: previous.revision + 1,
      updatedAt: now.toISOString(),
    };
    return {
      result: rule,
      state: {
        ...state,
        rules: state.rules.map((entry) =>
          entry.id === rule.id ? rule : entry,
        ),
      },
    };
  });
}

type ItemChange = { readonly id: string; readonly expectedRevision: number } & (
  | { readonly action: "acknowledge" | "dismiss" }
  | { readonly action: "snooze"; readonly minutes: number }
);

export function changeAttentionItem(
  store: AttentionStore,
  change: ItemChange,
  now: Date,
): Promise<AttentionInboxItem | undefined> {
  const snoozedUntil =
    change.action === "snooze"
      ? attentionSnoozeUntil(now, change.minutes)
      : undefined;
  return updateAttentionState<AttentionInboxItem | undefined>(
    store,
    (state) => {
      const previous = state.inbox.find((item) => item.id === change.id);
      if (
        !previous ||
        previous.revision !== change.expectedRevision ||
        (change.action === "snooze" && previous.status !== "open")
      )
        return { result: undefined };
      const item: AttentionInboxItem = {
        ...previous,
        ...(change.action === "snooze"
          ? { snoozedUntil: snoozedUntil! }
          : {
              status:
                change.action === "acknowledge" ? "acknowledged" : "dismissed",
            }),
        revision: previous.revision + 1,
        updatedAt: now.toISOString(),
      };
      return {
        result: item,
        state: {
          ...state,
          inbox: state.inbox.map((entry) =>
            entry.id === item.id ? item : entry,
          ),
        },
      };
    },
  );
}

export function pruneAttentionHistory(
  store: AttentionStore,
  now: Date,
): Promise<number> {
  const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60_000).toISOString();
  return updateAttentionState(store, (state) => {
    const inbox = state.inbox.filter((item) => item.createdAt >= cutoff);
    const removed = state.inbox.length - inbox.length;
    return removed === 0
      ? { result: 0 }
      : { result: removed, state: { ...state, inbox } };
  });
}
