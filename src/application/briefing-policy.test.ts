import type {
  BriefingSourcePort,
  BriefingSourceResult,
} from "../ports/briefing.js";
import { createDailyBriefingAggregator } from "./briefing-policy.js";

describe("createDailyBriefingAggregator", () => {
  it("orders selected source projections and isolates failures", async () => {
    const diagnostics: unknown[] = [];
    const source = (
      section: BriefingSourceResult["section"],
      text: string,
    ): BriefingSourcePort => ({
      read: () =>
        Promise.resolve({
          attention: [],
          facts: { [`${section}Count`]: 1 },
          items: [{ key: `${section}:one`, text }],
          section,
        }),
      section,
    });
    const failing: BriefingSourcePort = {
      read: () => Promise.reject(new Error("calendar token leaked")),
      section: "calendar",
    };
    const aggregate = createDailyBriefingAggregator([
      source("tasks", "One task is due."),
      failing,
      source("profile", "Good morning, Zak."),
    ]);

    const result = await aggregate.create(
      {
        length: "standard",
        sections: ["tasks", "calendar", "profile"],
        sinceLast: false,
        timeZone: "Europe/London",
      },
      {
        now: new Date("2026-09-04T07:00:00.000Z"),
        reportDiagnostic: (error) => diagnostics.push(error),
      },
    );

    expect(result.text).toBe(
      "Good morning, Zak. Calendar is unavailable. One task is due.",
    );
    expect(result.facts).toEqual({ profileCount: 1, tasksCount: 1 });
    expect(result.snapshot.sections.map(({ section }) => section)).toEqual([
      "profile",
      "calendar",
      "tasks",
    ]);
    expect(diagnostics).toHaveLength(1);
    expect(result.text).not.toContain("token");
  });

  it("uses deterministic exceptional-item semantics for attention-only", async () => {
    const source: BriefingSourcePort = {
      read: () =>
        Promise.resolve({
          attention: ["task:overdue"],
          facts: { overdueCount: 1 },
          items: [
            { key: "task:routine", text: "A routine task exists." },
            { key: "task:overdue", text: "Tax return is overdue." },
          ],
          section: "tasks",
        }),
      section: "tasks",
    };

    const result = await createDailyBriefingAggregator([source]).create(
      {
        length: "attention-only",
        sections: ["tasks"],
        sinceLast: false,
        timeZone: "Europe/London",
      },
      {
        now: new Date("2026-09-04T07:00:00.000Z"),
        reportDiagnostic: () => {},
      },
    );

    expect(result.text).toBe("Tax return is overdue.");
  });

  it("isolates each internet topic and keeps citations attached to selected items", async () => {
    const diagnostics: unknown[] = [];
    const source: BriefingSourcePort = {
      read: ({ topic }) =>
        topic === "broken"
          ? Promise.reject(new Error("one topic failed"))
          : Promise.resolve({
              attention: topic === "urgent" ? [`internet:${topic}`] : [],
              facts: { topic: topic! },
              items: [
                {
                  citations: [
                    {
                      title: `${topic} source`,
                      url: `https://example.com/${topic}`,
                    },
                  ],
                  key: `internet:${topic}`,
                  text: `${topic} update`,
                },
              ],
              section: "internet",
            }),
      section: "internet",
    };
    const aggregator = createDailyBriefingAggregator([source]);
    const context = {
      now: new Date("2026-09-04T07:00:00.000Z"),
      reportDiagnostic: (error: unknown) => diagnostics.push(error),
    };

    const short = await aggregator.create(
      {
        length: "short",
        sections: ["internet"],
        sinceLast: false,
        timeZone: "Europe/London",
        topics: ["first", "second", "broken"],
      },
      context,
    );
    const attention = await aggregator.create(
      {
        length: "attention-only",
        sections: ["internet"],
        sinceLast: false,
        timeZone: "Europe/London",
        topics: ["routine", "urgent"],
      },
      context,
    );

    expect(short.text).toBe("first update");
    expect(short.citations).toEqual([
      { title: "first source", url: "https://example.com/first" },
    ]);
    expect(short.snapshot.sections[0]).toMatchObject({ available: true });
    expect(diagnostics).toHaveLength(1);
    expect(attention.text).toBe("urgent update");
    expect(attention.citations).toEqual([
      { title: "urgent source", url: "https://example.com/urgent" },
    ]);
  });

  it("bounds source items before snapshot persistence and still renders useful text", async () => {
    const source: BriefingSourcePort = {
      read: () =>
        Promise.resolve({
          attention: [],
          facts: {},
          items: [{ key: "tasks:large", text: "word ".repeat(900) }],
          section: "tasks",
        }),
      section: "tasks",
    };

    const result = await createDailyBriefingAggregator([source]).create(
      {
        length: "short",
        sections: ["tasks"],
        sinceLast: false,
        timeZone: "Europe/London",
      },
      {
        now: new Date("2026-09-04T07:00:00.000Z"),
        reportDiagnostic: () => {},
      },
    );

    expect(result.text).not.toBe("There is nothing that needs your attention.");
    expect(result.text.length).toBeLessThanOrEqual(350);
    expect(
      result.snapshot.sections[0]!.items[0]!.text.length,
    ).toBeLessThanOrEqual(500);
  });

  it("compares stable items without treating reordering as a change", async () => {
    let items = [
      { key: "task:alpha", text: "Alpha is due today." },
      { key: "task:beta", text: "Beta is due today." },
    ];
    const source: BriefingSourcePort = {
      read: () =>
        Promise.resolve({ attention: [], facts: {}, items, section: "tasks" }),
      section: "tasks",
    };
    const aggregator = createDailyBriefingAggregator([source]);
    const request = {
      length: "standard" as const,
      sections: ["tasks"] as const,
      sinceLast: false,
      timeZone: "Europe/London",
    };
    const context = {
      now: new Date("2026-09-04T07:00:00.000Z"),
      reportDiagnostic: () => {},
    };
    const first = await aggregator.create(request, context);
    items = [items[1]!, items[0]!];

    const unchanged = await aggregator.create(
      { ...request, sinceLast: true },
      { ...context, lastSnapshot: first.snapshot },
    );
    items = [{ key: "task:alpha", text: "Alpha is overdue." }];
    const changed = await aggregator.create(
      { ...request, sinceLast: true },
      { ...context, lastSnapshot: first.snapshot },
    );

    expect(unchanged.text).toBe(
      "Nothing has changed since your last briefing.",
    );
    expect(changed.text).toBe(
      "Changed since your last briefing: Alpha is overdue. No longer listed: Beta is due today.",
    );
  });
});
