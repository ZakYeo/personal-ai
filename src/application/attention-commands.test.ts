import {
  createTestAttentionStore as createInMemoryAttentionStore,
  createTestAttentionItem,
  createTestAttentionRule,
} from "../test-support/attention.js";
import {
  changeAttentionItem,
  changeAttentionRule,
  enableAttentionRule,
  pruneAttentionHistory,
} from "./attention-commands.js";

const now = new Date("2026-09-07T12:00:00.000Z");

describe("explicit attention lifecycle", () => {
  it("bounds saved rules and permits only one enabled morning routine", async () => {
    const store = createInMemoryAttentionStore({ timeZone: "UTC" });
    const common = { timeZone: "UTC", request: "Enable this rule" };
    await enableAttentionRule(
      store,
      {
        ...common,
        name: "Morning",
        definition: { kind: "morning_routine", localTime: "08:00" },
      },
      now,
    );
    await expect(
      enableAttentionRule(
        store,
        {
          ...common,
          name: "Another morning",
          definition: { kind: "morning_routine", localTime: "09:00" },
        },
        now,
      ),
    ).rejects.toThrow("existing morning routine");
    for (let index = 1; index < 24; index += 1)
      await enableAttentionRule(
        store,
        {
          ...common,
          name: `Rule ${index}`,
          definition: { kind: "due_tasks", daysAhead: 0 },
        },
        now,
      );
    await expect(
      enableAttentionRule(
        store,
        { ...common, name: "Too many", definition: { kind: "runtime_health" } },
        now,
      ),
    ).rejects.toThrow("at most 24");
    expect((await store.read()).rules).toHaveLength(24);
  });

  it("saves exact user provenance and reuses a named rule without inventing more rules", async () => {
    const store = createInMemoryAttentionStore({ timeZone: "UTC" });
    const input = {
      name: "Due work",
      definition: { kind: "due_tasks" as const, daysAhead: 0 },
      timeZone: "Europe/London",
      request: "Enable my due work notifications",
    };
    const created = await enableAttentionRule(store, input, now);
    expect(created).toMatchObject({
      enabled: true,
      provenance: { kind: "user_authored", request: input.request },
      cooldownMinutes: 60,
      quietHours: { start: "22:00", end: "08:00" },
    });
    const updated = await enableAttentionRule(
      store,
      { ...input, definition: { kind: "due_tasks", daysAhead: 1 } },
      now,
    );
    expect(updated.id).toBe(created.id);
    expect(updated.revision).toBe(2);
    expect((await store.read()).rules).toHaveLength(1);
  });
  it("checks rule revisions and snoozes without silently re-enabling a disabled rule", async () => {
    const store = createInMemoryAttentionStore({ timeZone: "UTC" });
    const rule = await enableAttentionRule(
      store,
      {
        name: "Due work",
        definition: { kind: "due_tasks", daysAhead: 0 },
        timeZone: "UTC",
        request: "Enable due work",
      },
      now,
    );
    expect(
      await changeAttentionRule(
        store,
        { id: rule.id, expectedRevision: 99, action: "disable" },
        now,
      ),
    ).toBeUndefined();
    expect(
      await changeAttentionRule(
        store,
        { id: rule.id, expectedRevision: 1, action: "disable" },
        now,
      ),
    ).toMatchObject({ enabled: false, revision: 2 });
    expect(
      await changeAttentionRule(
        store,
        { id: rule.id, expectedRevision: 2, action: "snooze", minutes: 30 },
        now,
      ),
    ).toMatchObject({
      enabled: false,
      snoozedUntil: "2026-09-07T12:30:00.000Z",
    });
  });
  it("acknowledges an inbox item without changing its uncertain delivery or replaying it", async () => {
    const store = createInMemoryAttentionStore({ timeZone: "UTC" });
    const state = await store.read();
    await store.replace(1, {
      ...state,
      revision: 2,
      nextId: 3,
      rules: [createTestAttentionRule()],
      inbox: [createTestAttentionItem()],
    });
    expect(
      await changeAttentionItem(
        store,
        { id: "attention-item-2", expectedRevision: 1, action: "acknowledge" },
        now,
      ),
    ).toMatchObject({
      status: "acknowledged",
      delivery: { status: "unknown" },
      revision: 2,
    });
    expect(
      await changeAttentionItem(
        store,
        { id: "attention-item-2", expectedRevision: 1, action: "dismiss" },
        now,
      ),
    ).toBeUndefined();
  });
  it("retains items exactly at the thirty-day cutoff and never prunes rule preferences", async () => {
    const store = createInMemoryAttentionStore({ timeZone: "UTC" });
    const state = await store.read();
    await store.replace(1, {
      ...state,
      revision: 2,
      nextId: 3,
      rules: [createTestAttentionRule()],
      inbox: [createTestAttentionItem()],
    });
    expect(
      await pruneAttentionHistory(store, new Date("2026-10-07T12:00:00.000Z")),
    ).toBe(0);
    expect(
      await pruneAttentionHistory(store, new Date("2026-10-07T12:00:00.001Z")),
    ).toBe(1);
    expect((await store.read()).rules).toHaveLength(1);
  });
});
