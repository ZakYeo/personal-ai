import { createResultReferenceSession } from "./result-reference-session.js";

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
    expect(session.resolve("calendar-event-1")).toEqual({
      kind: "calendar_event",
      providerEventId: "id-1",
    });
  });

  it("replaces prior results and expires after three subsequent turns", () => {
    const session = createResultReferenceSession();
    session.retain(resultSet("old"));
    session.retain(resultSet("new"));

    expect(session.resolve("calendar-event-1")).toMatchObject({
      providerEventId: "new",
    });
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

  it("clears immediately when conversation history compacts", () => {
    const session = createResultReferenceSession();
    session.retain(resultSet("event"));

    session.clear();

    expect(session.resolve("calendar-event-1")).toBeUndefined();
  });

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
