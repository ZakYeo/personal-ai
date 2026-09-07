import type { AlarmStore } from "../ports/alarm-store.js";
import type { AttentionCandidate, AttentionStore } from "../ports/attention.js";
import type { TaskStore } from "../ports/task-store.js";

export function createAttentionHealthSource(sources: {
  attention: Pick<AttentionStore, "read">;
  tasks?: Pick<TaskStore, "listTasks">;
  alarms?: Pick<AlarmStore, "list">;
  timeZone: string;
}) {
  return {
    read: async (now: Date): Promise<AttentionCandidate[]> => {
      const result: AttentionCandidate[] = [];
      // Sequential narrow reads keep this source within one engine worker's budget.
      for (const task of (await sources.tasks?.listTasks()) ?? []) {
        if (
          task.reminder?.status !== "claimed" ||
          now.getTime() - Date.parse(task.reminder.claimedAt) < 60_000
        )
          continue;
        result.push({
          key: attentionReminderKey(task.id, task.reminder.claimedAt),
          text: `Delivery of the reminder for ${task.label} is unknown. It will not be replayed automatically.`,
          explanation:
            "The reminder was durably claimed but no completed delivery was recorded. You can acknowledge the reminder without completing its task.",
          timeZone: sources.timeZone,
          facts: {
            label: task.label,
            claimedAt: task.reminder.claimedAt,
            scheduledFor: task.reminder.scheduledFor,
            problem: "reminder_delivery_unknown",
          },
        });
      }
      for (const alarm of (await sources.alarms?.list()) ?? []) {
        if (alarm.status !== "missed") continue;
        result.push({
          key: `alarm:${alarm.id}:${alarm.scheduledFor}`,
          text: `The alarm ${alarm.label} was missed.`,
          explanation:
            "The canonical alarm store records a missed alarm. No new delivery has been scheduled.",
          timeZone: sources.timeZone,
          facts: {
            label: alarm.label,
            scheduledFor: alarm.scheduledFor,
            problem: "alarm_missed",
          },
        });
      }
      const state = await sources.attention.read();
      for (const evaluation of state.evaluations) {
        if (evaluation.completed?.reason !== "source_unavailable") continue;
        const rule = state.rules.find(
          (rule) =>
            rule.id === evaluation.ruleId &&
            rule.revision === evaluation.ruleRevision &&
            rule.enabled,
        );
        if (!rule || rule.definition.kind === "runtime_health") continue;
        result.push({
          key: `source:${rule.id}:${rule.revision}`,
          text: `The source for ${rule.name} is unavailable.`,
          explanation:
            "The latest evaluation could not read its configured source. Review the integration before relying on this rule.",
          timeZone: sources.timeZone,
          facts: {
            ruleName: rule.name,
            evaluatedAt: evaluation.completed.evaluatedAt,
            problem: "source_unavailable",
          },
        });
      }
      return result.sort((a, b) => a.key.localeCompare(b.key)).slice(0, 10);
    },
  };
}

export function attentionReminderKey(id: string, claimedAt: string): string {
  return `reminder:${id}:${claimedAt}`;
}
