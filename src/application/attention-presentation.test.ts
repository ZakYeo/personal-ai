import { presentAttentionNotice } from "./attention-presentation.js";
import {
  createTestAttentionItem,
  createTestAttentionRule,
} from "../test-support/attention.js";
import {
  attentionCandidateKey,
  prepareAttentionCandidate,
} from "./attention-candidate.js";

it("stores dated human-safe calendar facts that remain true after a day or timezone offset change", () => {
  const instant = "2026-10-24T13:00:00.000Z";
  const candidate = prepareAttentionCandidate(
    {
      key: "meeting",
      text: `Planning starts at ${instant}.`,
      explanation: "An upcoming event.",
      timeZone: "Europe/London",
      facts: { startAt: instant },
    },
    createTestAttentionRule(),
    new Date("2026-10-24T12:00:00.000Z"),
  );
  expect(candidate.text).toContain("24 October 2026");
  expect(candidate.text).not.toContain("today");
  expect(candidate.facts.startAt).toBe(instant);
});

it("preserves attribution before truncated source-authored relative wording and later lifecycle updates", () => {
  const item = {
    ...createTestAttentionItem(),
    observedAt: "2026-10-24T12:00:00.000Z",
    updatedAt: "2026-10-26T12:00:00.000Z",
    text:
      "The weather was observed five minutes ago. " +
      "Long detail. ".repeat(50),
  };
  expect(
    presentAttentionNotice(item, { rules: [], evaluations: [] }, undefined, 80)
      .text,
  ).toMatch(
    /^Recorded at 1pm on 24 October 2026, London time: The weather was observed five minutes ago\./u,
  );
  expect(
    presentAttentionNotice(item, { rules: [], evaluations: [] }, undefined, 80)
      .text.length,
  ).toBeLessThan(160);
});

it("reflects integration recovery from the canonical completed evaluation without rewriting history", () => {
  const rule = createTestAttentionRule();
  const item = {
    ...createTestAttentionItem(),
    key: attentionCandidateKey(
      { kind: "runtime_health" },
      `source:${rule.id}:${rule.revision}`,
    ),
    facts: { problem: "source_unavailable" },
  };
  const state = {
    rules: [rule],
    evaluations: [
      {
        ruleId: rule.id,
        ruleRevision: rule.revision,
        slot: 2,
        completed: {
          slot: 1,
          evaluatedAt: item.createdAt,
          reason: "no_match" as const,
        },
      },
    ],
  };
  expect(presentAttentionNotice(item, state, undefined).text).toContain(
    "latest completed source check succeeded",
  );
  expect(item.delivery.status).toBe("unknown");
});
