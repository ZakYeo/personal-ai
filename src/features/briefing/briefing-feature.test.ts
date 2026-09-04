import { createDailyBriefingAggregator } from "../../application/briefing-policy.js";
import { getDeterministicFeatureRules } from "../../application/deterministic-feature-rules.js";
import { createInMemoryBriefingStore } from "../../test-support/briefing-store.js";
import {
  executeFeature,
  expectCapabilityMetadata,
} from "../../test-support/feature-contract.js";
import { createBriefingFeature } from "./briefing-feature.js";

describe("briefing feature", () => {
  it("routes deterministic briefing management requests without also fetching a briefing", () => {
    const feature = createBriefingFeature(
      createDailyBriefingAggregator([]),
      createInMemoryBriefingStore({
        now: () => new Date("2026-09-04T07:00:00.000Z"),
        timeZone: "Europe/London",
      }),
    );
    const rules = getDeterministicFeatureRules(feature);
    const matches = (text: string) =>
      rules.flatMap((rule) =>
        rule.match(text) === undefined ? [] : [rule.capability],
      );

    expect(matches("show my daily briefing preferences")).toEqual([
      "briefing.preferences.show",
    ]);
    expect(matches("make my daily briefing short")).toEqual([
      "briefing.preferences.update",
    ]);
    expect(matches("add ai safety to my daily briefing topics")).toEqual([
      "briefing.topic.add",
    ]);
    expect(matches("remove ai safety from my daily briefing topics")).toEqual([
      "briefing.topic.remove",
    ]);
    expect(
      matches(
        "schedule my daily briefing for 08:00 on monday,tuesday in europe/london",
      ),
    ).toEqual(["briefing.schedule.set"]);
    expect(matches("disable my scheduled daily briefing")).toEqual([
      "briefing.schedule.disable",
    ]);
  });

  it("returns and retains an on-demand daily briefing", async () => {
    let text = "You have one task due today.";
    const store = createInMemoryBriefingStore({
      now: () => new Date("2026-09-04T07:00:00.000Z"),
      sections: ["tasks"],
      timeZone: "Europe/London",
    });
    const feature = createBriefingFeature(
      createDailyBriefingAggregator([
        {
          read: () =>
            Promise.resolve({
              attention: ["task:one"],
              facts: { taskCount: 1 },
              items: [{ key: "task:one", text }],
              section: "tasks",
            }),
          section: "tasks",
        },
      ]),
      store,
    );

    await expect(
      executeFeature(feature, "briefing.get_daily", {}),
    ).resolves.toMatchObject({
      data: { taskCount: 1 },
      text: "You have one task due today.",
    });
    text = "You have two tasks due today.";
    await expect(
      executeFeature(feature, "briefing.get_daily", { sinceLast: true }),
    ).resolves.toMatchObject({
      text: "Changed since your last briefing: You have two tasks due today.",
    });
  });

  it("explains when no comparison baseline exists", async () => {
    const store = createInMemoryBriefingStore({
      now: () => new Date("2026-09-04T07:00:00.000Z"),
      timeZone: "Europe/London",
    });
    const feature = createBriefingFeature(
      createDailyBriefingAggregator([]),
      store,
    );

    await expect(
      executeFeature(feature, "briefing.get_daily", { sinceLast: true }),
    ).resolves.toMatchObject({
      text: "I do not have an earlier delivered briefing to compare with yet.",
    });
  });

  it("updates preferences and confirms schedule mutations", async () => {
    const store = createInMemoryBriefingStore({
      now: () => new Date("2026-09-04T07:00:00.000Z"),
      timeZone: "Europe/London",
    });
    const feature = createBriefingFeature(
      createDailyBriefingAggregator([]),
      store,
    );

    expectCapabilityMetadata(feature, {
      name: "briefing.schedule.set",
      requiresConfirmation: true,
      risk: "high",
    });
    await expect(
      executeFeature(feature, "briefing.preferences.update", {
        mode: "short",
        sections: "calendar,tasks",
      }),
    ).resolves.toMatchObject({
      data: { length: "short", sections: "calendar,tasks" },
      text: expect.stringMatching(/short.*calendar and tasks/u) as string,
    });
    await expect(
      executeFeature(feature, "briefing.topic.add", { topic: "AI safety" }),
    ).resolves.toMatchObject({
      data: { searchTopics: "AI safety" },
      text: expect.stringContaining("AI safety") as string,
    });
    await expect(
      executeFeature(feature, "briefing.schedule.set", {
        localTime: "08:00",
        timeZone: "Europe/London",
        weekdays: "monday,tuesday,wednesday,thursday,friday",
      }),
    ).resolves.toMatchObject({
      data: {
        localTime: "08:00",
        timeZone: "Europe/London",
      },
    });
  });
});
