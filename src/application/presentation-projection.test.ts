import {
  buildAssistantPresentationProjection,
  emptyAssistantPresentationProjection,
  parseAssistantPresentationProjection,
} from "./presentation-projection.js";

describe("presentation projection builder", () => {
  it("sanitizes feature text and source titles while preserving exact targets", () => {
    const projection = buildAssistantPresentationProjection(
      {
        ...emptyAssistantPresentationProjection,
        sources: [
          {
            title: "Read https://example.test/private",
            url: "https://example.test/private",
          },
        ],
        tasks: [
          {
            id: "task-1",
            label: "Task\u0000 https://example.test/private",
            status: "open",
          },
        ],
      },
      { now: new Date("2026-09-04T10:00:00Z"), timeZone: "Europe/London" },
    );
    expect(projection.tasks[0]?.id).toBe("task-1");
    expect(projection.tasks[0]?.label).toBe("Task the linked source");
    expect(projection.sources[0]).toEqual({
      title: "Read the linked source",
      url: "https://example.test/private",
    });
    expect(parseAssistantPresentationProjection(projection)).toEqual(
      projection,
    );
  });
});

it("sanitizes and freezes bounded attention notices without accepting private fields", () => {
  const projection = buildAssistantPresentationProjection(
    {
      ...emptyAssistantPresentationProjection,
      attention: [
        {
          id: "attention-item-1",
          revision: 2,
          title: "Health",
          text: "Read https://example.test/private",
          explanation: "A reminder outcome is unknown.",
          provenance: "Notify me about problems",
          recordedAt: "2026-09-07T12:00:00.000Z",
          status: "open",
          delivery: "unknown",
          canResolveReminder: true,
        },
      ],
    },
    { now: new Date("2026-09-07T12:00:00.000Z"), timeZone: "Europe/London" },
  );
  expect(projection.attention[0]?.text).not.toContain("https:");
  expect(Object.isFrozen(projection.attention[0])).toBe(true);
  expect(
    parseAssistantPresentationProjection({
      ...projection,
      attention: [{ ...projection.attention[0], privateTarget: "task-secret" }],
    }),
  ).toBeUndefined();
});
