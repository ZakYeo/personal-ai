import { parseBriefingState } from "./briefing-state-schema.js";

describe("parseBriefingState", () => {
  it("parses each valid delivery-slot state", () => {
    expect(
      parseBriefingState(
        state({
          slots: [
            {
              claimedAt: "2026-09-04T07:00:00.000Z",
              id: "claimed",
              status: "claimed",
            },
            {
              claimedAt: "2026-09-04T07:00:00.000Z",
              deliveredAt: "2026-09-04T07:01:00.000Z",
              id: "delivered",
              status: "delivered",
            },
            {
              id: "skipped",
              skippedAt: "2026-09-04T07:00:00.000Z",
              status: "skipped",
            },
          ],
        }),
      ).slots,
    ).toHaveLength(3);
  });

  it.each([
    [
      "claimed with delivery",
      {
        claimedAt: "2026-09-04T07:00:00.000Z",
        deliveredAt: "2026-09-04T07:01:00.000Z",
        id: "slot",
        status: "claimed",
      },
    ],
    [
      "skipped with claim",
      {
        claimedAt: "2026-09-04T07:00:00.000Z",
        id: "slot",
        skippedAt: "2026-09-04T07:01:00.000Z",
        status: "skipped",
      },
    ],
    [
      "delivered before claim",
      {
        claimedAt: "2026-09-04T07:01:00.000Z",
        deliveredAt: "2026-09-04T07:00:00.000Z",
        id: "slot",
        status: "delivered",
      },
    ],
  ])("rejects contradictory slot state: %s", (_label, slot) => {
    expect(() => parseBriefingState(state({ slots: [slot] }))).toThrow(
      "invalid state",
    );
  });

  it.each([
    {
      slots: [
        {
          claimedAt: "2026-09-04T07:00:00.000Z",
          id: "same",
          status: "claimed",
        },
        {
          id: "same",
          skippedAt: "2026-09-04T07:00:00.000Z",
          status: "skipped",
        },
      ],
    },
    { preferences: { revision: 0 } },
    { preferences: { searchTopics: ["AI", "ai"] } },
    {
      lastSnapshot: {
        createdAt: "2026-09-04T07:00:00.000Z",
        sections: [snapshotSection("tasks"), snapshotSection("tasks")],
        timeZone: "Europe/London",
      },
    },
    {
      lastSnapshot: {
        createdAt: "2026-09-04T07:00:00.000Z",
        sections: [
          snapshotSection("tasks", [
            { key: "same", text: "One" },
            { key: "same", text: "Two" },
          ]),
        ],
        timeZone: "Europe/London",
      },
    },
    {
      lastSnapshot: {
        createdAt: "2026-09-04T07:00:00.000Z",
        sections: [
          snapshotSection("tasks", [{ key: "key", text: "x".repeat(501) }]),
        ],
        timeZone: "Europe/London",
      },
    },
  ])("rejects corrupt bounded state %#", (overrides) => {
    expect(() => parseBriefingState(state(overrides))).toThrow("invalid state");
  });
});

function state(overrides: Record<string, unknown> = {}) {
  const base = {
    preferences: {
      length: "standard",
      quietHours: { end: "07:00", start: "22:00" },
      revision: 1,
      searchTopics: [],
      sections: ["tasks"],
      updatedAt: "2026-09-04T07:00:00.000Z",
    },
    slots: [],
    version: 1,
  };
  return {
    ...base,
    ...overrides,
    ...(overrides.preferences && typeof overrides.preferences === "object"
      ? {
          preferences: {
            ...base.preferences,
            ...overrides.preferences,
          },
        }
      : {}),
  };
}

function snapshotSection(
  section: string,
  items: { key: string; text: string }[] = [],
) {
  return { available: true, items, section };
}
