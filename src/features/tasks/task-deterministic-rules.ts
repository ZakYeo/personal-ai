import type { DeterministicFeatureRule } from "../../ports/deterministic-feature-rules.js";
import { parseSpokenOrdinal } from "../../ports/spoken-ordinal.js";

export const taskDeterministicRules = [
  {
    capability: "task.remind",
    match: (text) => {
      const match =
        /^remind me at (?<reminderAt>\d{4}-\d{2}-\d{2}t\d{2}:\d{2}:\d{2}(?:\.\d{3})?z) to (?<label>.+) on (?:my )?(?<listName>.+) list$/u.exec(
          text,
        );
      const { label, listName, reminderAt } = match?.groups ?? {};
      return label && listName && reminderAt
        ? {
            label,
            listName,
            reminderAt: canonicalizeNormalizedTimestamp(reminderAt),
          }
        : undefined;
    },
  },
  {
    capability: "task.reminder.acknowledge",
    match: (text) =>
      matchTaskTarget(text, "acknowledge (?:the )?reminder for", "on"),
  },
  {
    capability: "task.list.rename",
    match: (text) => {
      const match =
        /^rename (?:my )?(?!.* on (?:my )?.+ list to)(?<name>.+) list to (?<newName>.+)$/u.exec(
          text,
        );
      const { name, newName } = match?.groups ?? {};
      return name && newName ? { name, newName } : undefined;
    },
  },
  {
    capability: "task.edit",
    match: (text) => {
      const match =
        /^rename (?<label>.+) on (?:my )?(?<listName>.+) list to (?<newLabel>.+)$/u.exec(
          text,
        );
      const { label, listName, newLabel } = match?.groups ?? {};
      return label && listName && newLabel
        ? { label, listName, newLabel }
        : undefined;
    },
  },
  {
    capability: "task.list.clear",
    match: (text) => {
      const listName = /^clear (?:my )?(.+) list$/u.exec(text)?.[1];
      return listName ? { listName } : undefined;
    },
  },
  {
    capability: "task.list.create",
    match: (text) => {
      const name =
        /^create (?:a )?(?:new )?(.+) list$/u.exec(text)?.[1] ??
        /^make (?:a )?(?:new )?(.+) list$/u.exec(text)?.[1];
      return name ? { name } : undefined;
    },
  },
  {
    capability: "task.list.show",
    match: (text) => {
      if (/^(?:show|list)(?: me)? (?:my )?lists$/u.test(text)) return {};
      const name = /^(?:show|list)(?: me)? (?:my )?(.+) list$/u.exec(text)?.[1];
      return name ? { name } : undefined;
    },
  },
  {
    capability: "task.create",
    match: (text) => {
      const match =
        /^(?:add|put) (?<label>.+) (?:to|on) (?:my )?(?<listName>.+) list$/u.exec(
          text,
        );
      const { label, listName } = match?.groups ?? {};
      return label && listName ? { label, listName } : undefined;
    },
  },
  {
    capability: "task.complete",
    match: (text) => matchTaskTarget(text, "complete", "on"),
  },
  {
    capability: "task.reopen",
    match: (text) => matchTaskTarget(text, "reopen", "on"),
  },
  {
    capability: "task.remove",
    match: (text) => matchTaskTarget(text, "remove", "from"),
  },
] as const satisfies readonly DeterministicFeatureRule[];

function matchTaskTarget(
  text: string,
  actionPattern: string,
  preposition: "from" | "on",
) {
  const ordinal = parseSpokenOrdinal(text);
  if (
    ordinal !== undefined &&
    new RegExp(
      `^${actionPattern} (?:the )?(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth) (?:one|item|task)$`,
      "u",
    ).test(text)
  ) {
    return { ordinal };
  }
  const match = new RegExp(
    `^${actionPattern} (?<label>.+) ${preposition} (?:my )?(?<listName>.+) list$`,
    "u",
  ).exec(text);
  const { label, listName } = match?.groups ?? {};
  return label && listName ? { label, listName } : undefined;
}

function canonicalizeNormalizedTimestamp(timestamp: string): string {
  return `${timestamp.slice(0, 10)}T${timestamp.slice(11, -1)}Z`;
}
