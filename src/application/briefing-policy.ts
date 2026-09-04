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
            if (section === "internet") {
              const topics = request.topics ?? [];
              if (topics.length === 0) return unavailable(section);
              const topicResults = await Promise.all(
                topics.map((topic) =>
                  source.read({
                    now: context.now,
                    ...(context.signal ? { signal: context.signal } : {}),
                    timeZone: request.timeZone,
                    topic,
                  }),
                ),
              );
              return {
                available: true as const,
                result: mergeInternetResults(topicResults),
                section,
              };
            }
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
      const renderedItems = request.sinceLast
        ? changedItems(items, snapshotSections, context.lastSnapshot)
        : items;
      return {
        citations,
        facts,
        snapshot: {
          createdAt: context.now.toISOString(),
          sections: snapshotSections,
          timeZone: request.timeZone,
        },
        text: renderWithin(renderedItems, lengthLimits[request.length]),
        usedInternet:
          selected.includes("internet") && (request.topics?.length ?? 0) > 0,
      };
    },
  };
}

function mergeInternetResults(
  results: readonly {
    readonly attention: readonly string[];
    readonly citations?: readonly {
      readonly title: string;
      readonly url: string;
    }[];
    readonly facts: Readonly<AssistantCommandParameters>;
    readonly items: readonly BriefingItem[];
    readonly section:
      | "profile"
      | "calendar"
      | "weather"
      | "alarms"
      | "tasks"
      | "internet";
  }[],
) {
  return {
    attention: results.flatMap(({ attention }) => [...attention]),
    citations: results
      .flatMap(({ citations }) => [...(citations ?? [])])
      .slice(0, 6),
    facts: results.reduce<AssistantCommandParameters>(
      (merged, { facts }, index) => {
        for (const [key, value] of Object.entries(facts)) {
          merged[`internet${index}${key[0]!.toUpperCase()}${key.slice(1)}`] =
            value;
        }
        return merged;
      },
      {},
    ),
    items: results.flatMap(({ items }) => [...items]),
    section: "internet" as const,
  };
}

function changedItems(
  currentItems: readonly BriefingItem[],
  sections: readonly BriefingSnapshotSection[],
  previous:
    | { readonly sections: readonly BriefingSnapshotSection[] }
    | undefined,
): readonly BriefingItem[] {
  if (!previous) return currentItems;
  const previousItems = new Map(
    previous.sections.flatMap(({ items }) =>
      items.map((item) => [item.key, item.text] as const),
    ),
  );
  const currentKeys = new Set(
    sections.flatMap(({ items }) => items.map(({ key }) => key)),
  );
  const changed = currentItems.filter(
    (item) => previousItems.get(item.key) !== item.text,
  );
  const removed = [...previousItems]
    .filter(([key]) => !currentKeys.has(key))
    .map(([key, text]) => ({
      key: `removed:${key}`,
      text: `No longer listed: ${text}`,
    }));
  const differences = [...changed, ...removed];
  return differences.length > 0
    ? [
        {
          key: "comparison:heading",
          text: `Changed since your last briefing: ${differences
            .map(({ text }) => text)
            .join(" ")}`,
        },
      ]
    : [
        {
          key: "comparison:none",
          text: "Nothing has changed since your last briefing.",
        },
      ];
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
