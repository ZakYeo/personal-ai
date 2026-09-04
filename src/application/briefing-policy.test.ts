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
});
