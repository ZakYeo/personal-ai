import { createResultReferenceSession } from "./result-reference-session.js";
import type { FeatureResultReferenceSet } from "../../ports/result-reference.js";

describe("result reference session", () => {
  it("retains only ten opaque references and resolves their private targets", () => {
    const session = createResultReferenceSession();

    session.retain({
      items: Array.from({ length: 12 }, (_, index) => ({
        facts: {
          date: "2026-07-17",
          time: "11:00",
          title: `Event ${index + 1}`,
        },
        target: {
          kind: "calendar_event" as const,
          providerEventId: `id-${index + 1}`,
        },
      })),
      kind: "calendar_events",
    });

    expect(session.publicReferences()).toHaveLength(10);
    expect(session.publicReferences()[0]).toMatchObject({
      facts: { title: "Event 1" },
      kind: "calendar_event",
      ordinal: 1,
      reference: "calendar-event-1",
    });
    expect(session.select({ rawText: "the first one" })).toMatchObject({
      target: { kind: "calendar_event", providerEventId: "id-1" },
    });
  });

  it("replaces prior results and expires after three subsequent turns", () => {
    const session = createResultReferenceSession();
    session.retain(resultSet("old"));
    session.retain(resultSet("new"));

    expect(session.select({ rawText: "the first one" })).toMatchObject({
      target: { providerEventId: "new" },
    });
    session.completeTurn();
    session.completeTurn();
    session.completeTurn();
    expect(session.publicReferences()).toHaveLength(1);
    session.completeTurn();
    expect(session.publicReferences()).toEqual([]);
  });

  it("clears stale references when a newer result set is empty", () => {
    const session = createResultReferenceSession();
    session.retain(resultSet("old"));

    session.retain({ items: [], kind: "calendar_events" });

    expect(session.publicReferences()).toEqual([]);
  });

  it("retains snapshot-only internet sources without inventing private targets", () => {
    const session = createResultReferenceSession();

    session.retain({
      items: [
        {
          facts: {
            title: "Current source",
            url: "https://example.com/current",
          },
        },
      ],
      kind: "internet_sources",
    });

    expect(session.select({ rawText: "the first source" })).toEqual({
      publicReference: {
        facts: {
          title: "Current source",
          url: "https://example.com/current",
        },
        kind: "internet_source",
        ordinal: 1,
        reference: "internet-source-1",
      },
    });
  });

  it("retains safe task facts while resolving a pinned private task target", () => {
    const session = createResultReferenceSession();

    session.retain({
      items: [
        {
          facts: {
            label: "Oat milk",
            listName: "Shopping",
            status: "open",
          },
          target: {
            kind: "task_item",
            listId: "private-list-id",
            listRevision: 2,
            revision: 3,
            taskId: "private-task-id",
          },
        },
      ],
      kind: "task_items",
    });

    expect(session.publicReferences()).toEqual([
      {
        facts: {
          label: "Oat milk",
          listName: "Shopping",
          status: "open",
        },
        kind: "task_item",
        ordinal: 1,
        reference: "task-item-1",
      },
    ]);
    expect(session.select({ rawText: "complete the first one" })).toMatchObject(
      {
        target: {
          kind: "task_item",
          listId: "private-list-id",
          listRevision: 2,
          revision: 3,
          taskId: "private-task-id",
        },
      },
    );
    expect(JSON.stringify(session.publicReferences())).not.toContain("private");
  });

  it("retains safe weather facts while resolving the full private location", () => {
    const session = createResultReferenceSession();

    session.retain({
      items: [
        {
          facts: {
            countryCode: "GB",
            name: "Eastbourne",
            timezone: "Europe/London",
          },
          target: {
            kind: "weather_location",
            location: {
              countryCode: "GB",
              latitude: 50.768,
              longitude: 0.29,
              name: "Eastbourne",
              timezone: "Europe/London",
            },
          },
        },
      ],
      kind: "weather_locations",
    });

    expect(session.publicReferences()).toEqual([
      {
        facts: {
          countryCode: "GB",
          name: "Eastbourne",
          timezone: "Europe/London",
        },
        kind: "weather_location",
        ordinal: 1,
        reference: "weather-location-1",
      },
    ]);
    expect(session.select({ rawText: "What about a coat?" })).toMatchObject({
      target: {
        kind: "weather_location",
        location: {
          latitude: 50.768,
          longitude: 0.29,
        },
      },
    });
    expect(JSON.stringify(session.publicReferences())).not.toContain(
      "latitude",
    );
  });

  it.each([
    {
      expectedKind: "calendar_event",
      resultSet: resultSet("event"),
    },
    {
      expectedKind: "internet_source",
      resultSet: {
        items: [
          {
            facts: {
              title: "Current source",
              url: "https://example.com/current",
            },
          },
        ],
        kind: "internet_sources",
      },
    },
    {
      expectedKind: "task_item",
      resultSet: {
        items: [
          {
            facts: {
              label: "Oat milk",
              listName: "Shopping",
              status: "open",
            },
            target: {
              kind: "task_item",
              listId: "list-id",
              listRevision: 1,
              revision: 1,
              taskId: "task-id",
            },
          },
        ],
        kind: "task_items",
      },
    },
    {
      expectedKind: "weather_location",
      resultSet: {
        items: [
          {
            facts: {
              countryCode: "GB",
              name: "Eastbourne",
              timezone: "Europe/London",
            },
            target: {
              kind: "weather_location",
              location: {
                countryCode: "GB",
                latitude: 50.768,
                longitude: 0.29,
                name: "Eastbourne",
                timezone: "Europe/London",
              },
            },
          },
        ],
        kind: "weather_locations",
      },
    },
  ] satisfies readonly {
    expectedKind: string;
    resultSet: FeatureResultReferenceSet;
  }[])(
    "preserves newly retained $expectedKind references across compaction",
    ({ expectedKind, resultSet }) => {
      const session = createResultReferenceSession();
      session.retain(resultSet);

      session.invalidateForCompaction();

      expect(session.publicReferences()).toMatchObject([
        { kind: expectedKind },
      ]);
      session.completeTurn();
      session.invalidateForCompaction();
      expect(session.publicReferences()).toEqual([]);
    },
  );

  it("owns ordinal selection, rejects provider conflicts, and advances focus", () => {
    const session = createResultReferenceSession();
    session.retain({
      items: ["first", "second", "third"].map((title) => ({
        facts: { date: "2026-07-17", time: "11:00", title },
        target: { kind: "calendar_event" as const, providerEventId: title },
      })),
      kind: "calendar_events",
    });

    expect(
      session.select({
        ordinal: 2,
        rawText: "Tell me about the second one",
        reference: "calendar-event-1",
      }),
    ).toBeUndefined();
    expect(
      session.select({ ordinal: 2, rawText: "Tell me about the second one" }),
    ).toMatchObject({ target: { providerEventId: "second" } });
    expect(
      session.select({ next: true, rawText: "What comes after it?" }),
    ).toMatchObject({ target: { providerEventId: "third" } });
  });

  it("does not accept a provider-guessed reference for an ambiguous utterance", () => {
    const session = createResultReferenceSession();
    session.retain({
      items: ["first", "second"].map((title) => ({
        facts: { date: "2026-07-17", time: "11:00", title },
        target: { kind: "calendar_event" as const, providerEventId: title },
      })),
      kind: "calendar_events",
    });

    expect(
      session.select({
        rawText: "Where is that?",
        reference: "calendar-event-2",
      }),
    ).toBeUndefined();
  });
});

function resultSet(providerEventId: string) {
  return {
    items: [
      {
        facts: { date: "2026-07-17", time: "11:00", title: providerEventId },
        target: { kind: "calendar_event" as const, providerEventId },
      },
    ],
    kind: "calendar_events" as const,
  };
}
