import type { AttentionCandidate } from "../ports/attention.js";
import type { BriefingSourcePort, BriefingStore } from "../ports/briefing.js";
import { createDailyBriefingAggregator } from "./briefing-policy.js";
import { createResponsePresentationReceipt } from "./response-presentation.js";
import { weatherLocalDate } from "./weather-policy.js";

const morningSections = ["profile", "calendar", "tasks", "weather"] as const;
export function createAttentionMorningSource(options: {
  store: BriefingStore;
  sources: readonly BriefingSourcePort[];
  reportDiagnostic(error: unknown): void;
}) {
  const aggregator = createDailyBriefingAggregator(
    options.sources.filter((source) =>
      morningSections.some((section) => section === source.section),
    ),
  );
  return {
    read: async (
      now: Date,
      timeZone: string,
      signal?: AbortSignal,
    ): Promise<AttentionCandidate[]> => {
      if ((await options.store.getPreferences()).schedule)
        throw new Error(
          "Disable the separate scheduled briefing before using the morning routine.",
        );
      const result = await aggregator.create(
        {
          length: "short",
          sections: morningSections,
          sinceLast: false,
          timeZone,
        },
        {
          now,
          reportDiagnostic: (error) => options.reportDiagnostic(error),
          ...(signal ? { signal } : {}),
        },
      );
      const facts: Record<string, string | number | boolean> = {
        briefingCreatedAt: result.snapshot.createdAt,
      };
      for (const [key, value] of Object.entries(result.facts)) {
        // Citation destinations remain in the briefing boundary, never the attention projection.
        if (
          key === "weatherAttributionUrl" ||
          value === undefined ||
          value === null
        )
          continue;
        facts[key] = value;
      }
      if (Object.keys(facts).length > 32)
        throw new Error("Morning briefing exceeded its fixed fact bound.");
      return [
        {
          key: `morning:${weatherLocalDate(now.toISOString(), timeZone)}`,
          text: `${result.text} You can ask me to help plan your day.`,
          explanation:
            "Your explicitly enabled morning routine reads only profile, calendar, tasks and weather. Missing sources are identified; no actions or new monitors are created.",
          timeZone,
          facts,
          presentation: createResponsePresentationReceipt(() =>
            options.store.saveSnapshot(result.snapshot),
          ),
        },
      ];
    },
  };
}
