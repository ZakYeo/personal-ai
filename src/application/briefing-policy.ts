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
              const topicResults = (
                await Promise.all(
                  topics.map(async (topic) => {
                    try {
                      return await source.read({
                        now: context.now,
                        ...(context.signal ? { signal: context.signal } : {}),
                        timeZone: request.timeZone,
                        topic,
                      });
                    } catch (error) {
                      reportBestEffort(context.reportDiagnostic, error);
                      return;
                    }
                  }),
                )
              ).filter((result) => result !== undefined);
              if (topicResults.length === 0) return unavailable(section);
              return {
                available: true as const,
                result: projectSourceResult(mergeInternetResults(topicResults)),
                section,
              };
            }
            return {
              available: true as const,
              result: projectSourceResult(
                await source.read({
                  now: context.now,
                  ...(context.signal ? { signal: context.signal } : {}),
                  timeZone: request.timeZone,
                }),
              ),
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
      const selectedItems = fitWithin(
        renderedItems,
        lengthLimits[request.length],
      );
      return {
        citations: uniqueCitations(
          selectedItems.flatMap(({ citations }) => [...(citations ?? [])]),
        ),
        facts,
        snapshot: {
          createdAt: context.now.toISOString(),
          sections: snapshotSections,
          timeZone: request.timeZone,
        },
        text:
          selectedItems.map(({ text }) => text).join(" ") ||
          "There is nothing that needs your attention.",
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
    items: results.flatMap(({ citations, items }) =>
      items.map((item) => ({
        ...(item.citations || citations
          ? { citations: item.citations ?? citations }
          : {}),
        key: item.key,
        text: item.text,
      })),
    ),
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
          text: "Changed since your last briefing:",
        },
        ...differences,
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

function fitWithin(
  items: readonly BriefingItem[],
  limit: number,
): readonly BriefingItem[] {
  const selected: BriefingItem[] = [];
  let used = 0;
  for (const item of items) {
    const separator = selected.length > 0 ? 1 : 0;
    const remaining = limit - used - separator;
    if (remaining <= 0) break;
    const text = truncateText(item.text, remaining);
    if (text.length === 0) break;
    selected.push({ ...item, text });
    used += separator + text.length;
    if (text.length < item.text.length) break;
  }
  return selected;
}

function projectSourceResult<
  T extends {
    readonly items: readonly BriefingItem[];
    readonly citations?: readonly {
      readonly title: string;
      readonly url: string;
    }[];
  },
>(result: T): T {
  const inheritedCitations = result.citations;
  return {
    ...result,
    items: result.items.map((item) => ({
      ...(item.citations || inheritedCitations
        ? { citations: item.citations ?? inheritedCitations }
        : {}),
      key: truncateText(item.key.trim(), 160),
      text: truncateText(item.text.trim(), 500),
    })),
  };
}

function truncateText(text: string, limit: number): string {
  if (text.length <= limit) return text;
  if (limit <= 1) return text.slice(0, limit);
  const prefix = text.slice(0, limit - 1).trimEnd();
  const boundary = prefix.lastIndexOf(" ");
  const safePrefix =
    boundary >= Math.floor(limit / 2) ? prefix.slice(0, boundary) : prefix;
  return `${safePrefix}…`;
}

function uniqueCitations(
  citations: readonly { readonly title: string; readonly url: string }[],
) {
  const seen = new Set<string>();
  return citations.filter((citation) => {
    const key = `${citation.title}\u0000${citation.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
