import { createCapabilityCatalog } from "../../application/capability-catalog.js";
import {
  createCommand,
  createRawFeature,
} from "../../test-support/core-assistant.js";
import { createClarificationDraft } from "./clarification-draft.js";

function harness() {
  let time = 0;
  const catalog = createCapabilityCatalog([
    createRawFeature({
      capabilities: [
        {
          name: "test.action",
          risk: "low",
          parameters: {
            label: { type: "string", required: true },
            time: { type: "string", required: true },
          },
        },
      ],
    }),
  ]);
  return {
    draft: createClarificationDraft({ now: () => new Date(time) }, catalog),
    advance: (value: number) => {
      time = value;
    },
  };
}

describe("shared interaction draft", () => {
  it.each([
    { fields: 16, length: 1 },
    { fields: 3, length: 1_000 },
  ])(
    "rejects aggregate plan overflow atomically for $fields fields of length $length",
    ({ fields, length }) => {
      const parameters = Object.fromEntries(
        Array.from({ length: fields }, (_, index) => [
          `field${index}`,
          { type: "string" as const },
        ]),
      );
      const catalog = createCapabilityCatalog([
        createRawFeature({
          capabilities: [{ name: "test.action", risk: "low", parameters }],
        }),
      ]);
      const draft = createClarificationDraft(
        { now: () => new Date(0) },
        catalog,
      );
      const initial = createCommand("test.action", { field0: "original" });
      expect(draft.openPlan([initial], ["old-reference"])).toBe(true);
      const before = draft.snapshot();
      const command = createCommand(
        "test.action",
        Object.fromEntries(
          Object.keys(parameters).map((key) => [key, "x".repeat(length)]),
        ),
      );
      expect(
        draft.openPlan([command, command, command], ["new-reference"]),
      ).toBe(false);
      expect(draft.snapshot()).toEqual(before);
    },
  );

  it("merges validated partial fields when a later question omits them", () => {
    const { draft } = harness();
    draft.open(
      {
        capability: "test.action",
        parameter: "time",
        partialCommand: createCommand("test.action", { label: "Tea" }),
      },
      [],
    );
    draft.takeReply();
    draft.open(
      {
        capability: "test.action",
        parameter: "time",
        partialCommand: createCommand("test.action"),
      },
      [],
    );
    expect(draft.snapshot().parameters).toEqual({ label: "Tea" });
  });
  it("keeps one deadline and reply budget when a clarification becomes a prepared plan", () => {
    const { draft, advance } = harness();
    draft.open({ capability: "test.action", parameter: "label" }, []);
    for (let reply = 0; reply < 3; reply += 1)
      expect(draft.takeReply()).toBe(true);
    const command = createCommand("test.action", {
      label: "Tea",
      time: "10am",
    });
    advance(299_000);
    expect(draft.openPlan([command], ["ref-1"])).toBe(true);
    command.parameters.label = "outside mutation";
    expect(draft.snapshot()).toMatchObject({
      remainingReplies: 0,
      expiresAt: "1970-01-01T00:05:00.000Z",
      steps: [
        {
          capability: "test.action",
          parameters: { label: "Tea", time: "10am" },
        },
      ],
    });
    expect(draft.takeReply()).toBe(false);
    advance(300_000);
    expect(draft.openPlan([command], [])).toBe(false);
  });
});
