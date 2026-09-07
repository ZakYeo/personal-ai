import {
  createTestAttentionStore,
  createTestAttentionRule,
  createTestAttentionItem,
} from "../test-support/attention.js";
import {
  disableAttentionFromItem,
  setAttentionBudget,
} from "./attention-controls.js";

it("disables an item's originating rule atomically and rejects a stale item revision", async () => {
  const store = createTestAttentionStore({ timeZone: "Europe/London" });
  const state = await store.read();
  await store.replace(state.revision, {
    ...state,
    revision: state.revision + 1,
    rules: [createTestAttentionRule()],
    inbox: [createTestAttentionItem()],
  });
  const item = (await store.read()).inbox[0]!;
  expect(
    await disableAttentionFromItem(
      store,
      { id: item.id, expectedRevision: item.revision + 1 },
      new Date(item.updatedAt),
    ),
  ).toBe(false);
  expect(
    await disableAttentionFromItem(
      store,
      { id: item.id, expectedRevision: item.revision },
      new Date(item.updatedAt),
    ),
  ).toBe(true);
  expect((await store.read()).rules[0]?.enabled).toBe(false);
});
it("validates the explicit budget and timezone before saving", async () => {
  const store = createTestAttentionStore({ timeZone: "Europe/London" });
  await expect(
    setAttentionBudget(store, { dailyBudget: 0, timeZone: "UTC" }),
  ).rejects.toThrow();
  await setAttentionBudget(store, {
    dailyBudget: 3,
    timeZone: "Europe/London",
  });
  expect((await store.read()).preferences.dailyBudget).toBe(3);
});
