import { renderAttentionHistory } from "../../application/attention-presentation.js";
import { applyAttentionInboxControl } from "../../application/attention-inbox-control.js";
import { attentionInboxActions } from "../../ports/attention.js";
import { defineCapability } from "../../application/feature.js";
import type { AttentionStore } from "../../ports/attention.js";
import type { TaskStore } from "../../ports/task-store.js";

const selectedParameters = {
  id: { type: "string", required: true },
  expectedRevision: { type: "number", required: true },
} as const;
export function createAttentionInboxCapabilities(
  store: AttentionStore,
  tasks?: TaskStore,
) {
  return {
    "attention.inbox.list": defineCapability({
      parameters: {},
      risk: "low",
      toolChain: "read",
      summary: "Read the current attention inbox.",
      description:
        "List up to five open notices that are not snoozed with opaque IDs and revisions for explicit follow-up actions. Notices are historical; delivery completion does not mean user acknowledgement.",
      spokenSummary: "read and manage your attention inbox",
      execute: async (_request, context) => {
        const items = (await store.read()).inbox
          .filter(
            (item) =>
              item.status === "open" &&
              (!item.snoozedUntil ||
                item.snoozedUntil <= context.clock.now().toISOString()),
          )
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 5);
        const references = Object.fromEntries(
          items.flatMap(
            (item, index): Array<[string, string | number]> => [
              [`item${index}Id`, item.id],
              [`item${index}Revision`, item.revision],
              [`item${index}Rule`, item.ruleName],
            ],
          ),
        );
        return {
          data: { count: items.length, ...references },
          toolObservationData: { count: items.length, ...references },
          responseRewrite: "disabled",
          text: items.length
            ? `Recorded notices: ${items.map((item) => `${item.ruleName}: ${renderAttentionHistory(item, 150)}`).join(" ")}`
            : "Your attention inbox has no open notices.",
        };
      },
    }),
    "attention.inbox.explain": defineCapability({
      parameters: { id: { type: "string", required: true } },
      risk: "low",
      summary: "Explain an attention notice and its provenance.",
      description:
        "Read the exact saved explanation, explicit rule provenance, recorded time and delivery status for one opaque inbox ID.",
      spokenSummary: "read and manage your attention inbox",
      execute: async (request) => {
        const item = (await store.read()).inbox.find(
          (item) => item.id === request.args.id,
        );
        if (!item)
          return { text: "That notice is no longer in the attention inbox." };
        return {
          data: {
            ...item.facts,
            id: item.id,
            revision: item.revision,
            recordedAt: item.observedAt,
            request: item.provenance.request,
          },
          responseRewrite: "disabled",
          text: `${renderAttentionHistory(item)} ${item.explanation} The rule was enabled by your request: ${item.provenance.request}. Delivery status is ${item.delivery.status.replaceAll("_", " ")}; inbox status is ${item.status}.`,
          spokenText: { dateStyle: "contextual", timeZone: item.timeZone },
        };
      },
    }),
    "attention.inbox.update": defineCapability({
      parameters: {
        ...selectedParameters,
        action: {
          type: "string",
          required: true,
          allowedValues: attentionInboxActions,
        },
        minutes: { type: "number" },
      },
      risk: "low",
      summary: "Acknowledge, snooze, dismiss or resolve one attention notice.",
      description:
        "Reduce interruptions for the exact ID and revision returned by the inbox. disable_rule means do not tell me about this again. resolve_reminder acknowledges the canonical uncertain reminder without completing its task or replaying it. Snooze requires 1 to 10080 minutes. These actions do not add permissions or output.",
      spokenSummary: "read and manage your attention inbox",
      execute: async (request, context) => {
        const { id } = request.args;
        const changed = await applyAttentionInboxControl(
          { store, ...(tasks ? { tasks } : {}) },
          request.args,
          context.clock.now(),
        );
        return {
          data: { id, changed },
          text: changed
            ? "Updated that attention notice."
            : "That notice changed or cannot be resolved this way. Please refresh the inbox.",
        };
      },
    }),
  };
}
