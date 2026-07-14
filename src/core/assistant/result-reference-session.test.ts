import { createResultReferenceSession } from "./result-reference-session.js";

describe("result reference session", () => {
  it("retains only ten opaque references and resolves their private targets", () => {
    const session = createResultReferenceSession();

    session.retain({
      items: Array.from({ length: 12 }, (_, index) => ({
        facts: { title: `Event ${index + 1}` },
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

  it("clears immediately when conversation history compacts", () => {
    const session = createResultReferenceSession();
    session.retain(resultSet("event"));

    session.clear();

    expect(session.resolve("calendar-event-1")).toBeUndefined();
  });
});

function resultSet(providerEventId: string) {
  return {
    items: [
      {
        facts: { title: providerEventId },
        target: { kind: "calendar_event" as const, providerEventId },
      },
    ],
    kind: "calendar_events" as const,
  };
}
