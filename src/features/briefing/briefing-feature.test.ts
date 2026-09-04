import { createDailyBriefingAggregator } from "../../application/briefing-policy.js";
import { createInMemoryBriefingStore } from "../../test-support/briefing-store.js";
import {
  executeFeature,
  expectCapabilityMetadata,
} from "../../test-support/feature-contract.js";
import { createBriefingFeature } from "./briefing-feature.js";

describe("briefing feature", () => {
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
    });
    await expect(
      executeFeature(feature, "briefing.topic.add", { topic: "AI safety" }),
    ).resolves.toMatchObject({ data: { searchTopics: "AI safety" } });
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
