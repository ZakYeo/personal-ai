import { createAttentionFeature } from "./attention-feature.js";
import {
  createTestAttentionStore,
  createTestAttentionRule,
  createTestAttentionItem,
} from "../../test-support/attention.js";
import {
  createFeatureContext,
  executeFeature,
} from "../../test-support/feature-contract.js";

async function setup() {
  const store = createTestAttentionStore({ timeZone: "Europe/London" });
  const state = await store.read();
  await store.replace(state.revision, {
    ...state,
    revision: state.revision + 1,
    rules: [createTestAttentionRule()],
    inbox: [createTestAttentionItem()],
  });
  const context = {
    ...createFeatureContext(),
    clock: { now: () => new Date("2026-09-07T12:00:00.000Z") },
  };
  return { store, context, feature: createAttentionFeature(store) };
}
it("lists bounded safe inbox references for a subsequent explicit lifecycle action", async () => {
  const { feature, context } = await setup();
  const result = await executeFeature(
    feature,
    "attention.inbox.list",
    {},
    context,
  );
  expect(result).toMatchObject({
    toolObservationData: { item0Id: "attention-item-2", item0Revision: 1 },
  });
});
it("acknowledges only the chosen current inbox item without changing delivery state", async () => {
  const { feature, context, store } = await setup();
  await executeFeature(
    feature,
    "attention.inbox.update",
    { id: "attention-item-2", expectedRevision: 1, action: "acknowledge" },
    context,
  );
  expect((await store.read()).inbox[0]).toMatchObject({
    status: "acknowledged",
    delivery: { status: "unknown" },
  });
});

it.each(["2026-09-08T12:00:00.000Z", "2026-10-26T12:00:00.000Z"])(
  "attributes saved wording to its original date when read on %s",
  async (date) => {
    const { feature, context } = await setup();
    context.clock.now = () => new Date(date);
    for (const command of ["attention.inbox.list", "attention.inbox.explain"]) {
      const result = await executeFeature(
        feature,
        command,
        command.endsWith("explain") ? { id: "attention-item-2" } : {},
        context,
      );
      expect(result.text).toContain(
        "Recorded at 1pm on 7 September 2026, London time:",
      );
    }
  },
);

it("keeps a full rule store within tool-observation bounds and can select a later named rule", async () => {
  const { store, feature, context } = await setup();
  const state = await store.read();
  await store.replace(state.revision, {
    ...state,
    revision: state.revision + 1,
    rules: Array.from({ length: 24 }, (_, index) => ({
      ...createTestAttentionRule(),
      id: `rule-${index}`,
      name: `Rule ${index}`,
    })),
  });
  const first = await executeFeature(
    feature,
    "attention.rules.list",
    {},
    context,
  );
  expect(
    Object.keys(first.toolObservationData ?? {}).length,
  ).toBeLessThanOrEqual(24);
  expect(first.toolObservationData).toMatchObject({ count: 7, totalCount: 24 });
  const second = await executeFeature(
    feature,
    "attention.rules.list",
    { offset: 7 },
    context,
  );
  expect(second.toolObservationData).toMatchObject({
    rule0Id: "rule-7",
    count: 7,
  });
  const named = await executeFeature(
    feature,
    "attention.rules.list",
    { name: "rule 23" },
    context,
  );
  expect(named.toolObservationData).toMatchObject({
    rule0Id: "rule-23",
    count: 1,
    totalCount: 1,
  });
});
