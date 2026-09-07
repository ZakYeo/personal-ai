import type {
  AttentionInboxControl,
  AttentionStore,
} from "../ports/attention.js";
import type { TaskStore } from "../ports/task-store.js";
import { changeAttentionItem } from "./attention-commands.js";
import { disableAttentionFromItem } from "./attention-controls.js";
import { resolveAttentionReminder } from "./attention-resolution.js";

export async function applyAttentionInboxControl(
  options: { store: AttentionStore; tasks?: TaskStore },
  control: AttentionInboxControl,
  now: Date,
): Promise<boolean> {
  const selected = {
    id: control.id,
    expectedRevision: control.expectedRevision,
  };
  switch (control.action) {
    case "disable_rule":
      return disableAttentionFromItem(options.store, selected, now);
    case "resolve_reminder":
      return (
        !!options.tasks &&
        resolveAttentionReminder(options.store, options.tasks, selected, now)
      );
    case "snooze":
      return !!(await changeAttentionItem(
        options.store,
        { ...selected, action: control.action, minutes: control.minutes ?? 60 },
        now,
      ));
    case "acknowledge":
    case "dismiss":
      return !!(await changeAttentionItem(
        options.store,
        { ...selected, action: control.action },
        now,
      ));
  }
}
