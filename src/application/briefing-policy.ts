import type {
  BriefingItem,
  BriefingSection,
  BriefingSnapshotSection,
  BriefingSourcePort,
  DailyBriefingAggregatorPort,
} from "../ports/briefing.js";
import type { AssistantCommandParameters } from "../ports/assistant.js";

const sectionOrder = [
  "profile",
  "calendar",
  "weather",
  "alarms",
  "tasks",
  "internet",
] as const satisfies readonly BriefingSection[];

const lengthLimits = {
  "attention-only": 500,
  short: 350,
  standard: 900,
} as const;

export function createDailyBriefingAggregator(
  sources: readonly BriefingSourcePort[],
): DailyBriefingAggregatorPort {
  const bySection = new Map(sources.map((source) => [source.section, source]));
  return {
    create: async (request, context) => {
      const selected = orderedSelectedSections(request.sections);
      const resolved = await Promise.all(
        selected.map(async (section) => {
          const source = bySection.get(section);
          if (!source) return unavailable(section);
          try {
            return {
              available: true as const,
              result: await source.read({
                now: context.now,
                ...(context.signal ? { signal: context.signal } : {}),
                timeZone: request.timeZone,
              }),
              section,
            };
          } catch (error) {
            reportBestEffort(context.reportDiagnostic, error);
            return unavailable(section);
          }
        }),
      );
      const facts: AssistantCommandParameters = {};
      for (const entry of resolved) {
        if (entry.available) Object.assign(facts, entry.result.facts);
      }
      const citations = resolved.flatMap((entry) =>
        entry.available ? [...(entry.result.citations ?? [])] : [],
      );
      const snapshotSections: BriefingSnapshotSection[] = resolved.map(
        (entry) => ({
          available: entry.available,
          items: entry.available ? [...entry.result.items] : [],
          section: entry.section,
        }),
      );
      const items = resolved.flatMap((entry) =>
        entry.available
          ? selectItems(
              entry.result.items,
              entry.result.attention,
              request.length,
            )
          : [
              {
                key: `${entry.section}:unavailable`,
                text: unavailableText(entry.section),
              },
            ],
      );
      return {
        citations,
        facts,
        snapshot: {
          createdAt: context.now.toISOString(),
          sections: snapshotSections,
          timeZone: request.timeZone,
        },
        text: renderWithin(items, lengthLimits[request.length]),
        usedInternet: selected.includes("internet"),
      };
    },
  };
}

function orderedSelectedSections(
  sections: readonly BriefingSection[],
): BriefingSection[] {
  const selected = new Set(sections);
  return sectionOrder.filter((section) => selected.has(section));
}

function unavailable(section: BriefingSection) {
  return { available: false as const, section };
}

function unavailableText(section: BriefingSection): string {
  const label =
    section === "internet"
      ? "Internet topics"
      : `${section[0]!.toUpperCase()}${section.slice(1)}`;
  return `${label} is unavailable.`;
}

function selectItems(
  items: readonly BriefingItem[],
  attention: readonly string[],
  length: "attention-only" | "short" | "standard",
): readonly BriefingItem[] {
  if (length === "attention-only") {
    const selected = new Set(attention);
    return items.filter((item) => selected.has(item.key));
  }
  if (length === "short") return items.slice(0, 1);
  return items;
}

function renderWithin(items: readonly BriefingItem[], limit: number): string {
  const selected: string[] = [];
  for (const item of items) {
    const candidate = [...selected, item.text].join(" ");
    if (candidate.length > limit) break;
    selected.push(item.text);
  }
  return selected.join(" ") || "There is nothing that needs your attention.";
}

function reportBestEffort(
  reportDiagnostic: (error: unknown) => void,
  error: unknown,
): void {
  try {
    reportDiagnostic(error);
  } catch {
    // Diagnostics cannot change the briefing result.
  }
}
