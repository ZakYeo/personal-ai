import { defineCapability } from "../../application/feature.js";
import { createAttentionDayPlan } from "../../application/attention-day-plan.js";
import type { CalendarSearchPort } from "../../ports/calendar.js";
import type { TaskStore } from "../../ports/task-store.js";

export function createAttentionPlanningCapability(sources: {
  calendar?: CalendarSearchPort;
  tasks?: TaskStore;
}) {
  return defineCapability({
    parameters: {},
    risk: "low",
    summary: "Help plan today with up to three read-only priorities.",
    description:
      "Use fixed calendar and open-task reads to suggest at most three priorities for today. Missing sources are explicit. Never create actions, schedules or monitors, and do not request another voice reply merely to offer planning.",
    spokenSummary: "help plan your day",
    execute: async (_request, context) => {
      const diagnostics: unknown[] = [];
      const result = await createAttentionDayPlan(sources, {
        now: context.clock.now(),
        timeZone: context.config.assistant.timeZone,
        reportDiagnostic: (error) => diagnostics.push(error),
        ...(context.signal ? { signal: context.signal } : {}),
      });
      return {
        data: result.facts,
        text: result.text,
        responseRewrite: "disabled",
        spokenText: {
          dateStyle: "contextual",
          timeZone: context.config.assistant.timeZone,
        },
        ...(diagnostics.length
          ? {
              diagnostics: diagnostics.map((cause) => ({
                cause,
                message: "A day-planning source was unavailable.",
              })),
            }
          : {}),
      };
    },
  });
}
