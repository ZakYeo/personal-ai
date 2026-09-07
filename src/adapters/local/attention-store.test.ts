import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createFileAttentionStore,
  createInMemoryAttentionStore,
} from "./attention-store.js";
import { parseAttentionState } from "./attention-state-schema.js";
import {
  createTestAttentionItem,
  createTestAttentionRule,
} from "../../test-support/attention.js";
import { createDurabilityUnknownStateFileSystem } from "../../test-support/local-json-state.js";

describe("durable attention state", () => {
  it("preserves an uncertain durable claim through restart and refuses to reset it for replay", async () => {
    const options = {
      filePath: "/state/attention.json",
      timeZone: "UTC",
      fileSystem: createDurabilityUnknownStateFileSystem(),
    };
    const store = createFileAttentionStore(options);
    const initial = await store.read();
    const claimed = {
      ...initial,
      revision: 2,
      nextId: 3,
      rules: [createTestAttentionRule()],
      inbox: [createTestAttentionItem()],
    };
    await expect(store.replace(1, claimed)).rejects.toThrow(
      "write outcome is unknown",
    );
    const restarted = createFileAttentionStore(options);
    expect(await restarted.read()).toEqual(claimed);
    expect(await restarted.replace(1, claimed)).toBe(false);
    await expect(
      Promise.resolve().then(() =>
        restarted.replace(2, {
          ...claimed,
          revision: 3,
          inbox: [
            {
              ...claimed.inbox[0]!,
              revision: 2,
              delivery: { status: "not_sent", reason: "eligible" },
            },
          ],
        }),
      ),
    ).rejects.toThrow();
  });

  it("detaches nested rule definitions and rejects duplicate names or missing provenance", async () => {
    const store = createInMemoryAttentionStore({ timeZone: "UTC" });
    const initial = await store.read();
    const rule = createTestAttentionRule();
    expect(
      await store.replace(1, {
        ...initial,
        revision: 2,
        nextId: 2,
        rules: [rule],
      }),
    ).toBe(true);
    Object.assign(rule.definition, { daysAhead: 7 });
    const saved = await store.read();
    expect(saved.rules[0]?.definition).toEqual({
      kind: "due_tasks",
      daysAhead: 0,
    });
    expect(() =>
      parseAttentionState({
        ...saved,
        rules: [...saved.rules, { ...saved.rules[0], id: "another" }],
      }),
    ).toThrow();
    expect(() =>
      parseAttentionState({
        ...saved,
        rules: [{ ...saved.rules[0], provenance: undefined }],
      }),
    ).toThrow();
  });

  it("starts with no enabled rules or inbox items and persists one revision-checked update", async () => {
    const directory = await mkdtemp(join(tmpdir(), "personal-ai-attention-"));
    const path = join(directory, "private", "attention.json");
    const store = createFileAttentionStore({
      filePath: path,
      timeZone: "Europe/London",
    });
    const initial = await store.read();
    expect(initial).toMatchObject({
      version: 1,
      revision: 1,
      nextId: 1,
      rules: [],
      inbox: [],
      evaluations: [],
    });
    const next = {
      ...initial,
      revision: 2,
      preferences: { ...initial.preferences, dailyBudget: 3 },
    };
    expect(await store.replace(1, next)).toBe(true);
    expect(await store.replace(1, next)).toBe(false);
    expect(
      await createFileAttentionStore({
        filePath: path,
        timeZone: "UTC",
      }).read(),
    ).toEqual(next);
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual(next);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect((await stat(join(directory, "private"))).mode & 0o777).toBe(0o700);
  });
  it("serializes competing updates and detaches caller-owned state", async () => {
    const store = createInMemoryAttentionStore({ timeZone: "Europe/London" });
    const initial = await store.read();
    const first = {
      ...initial,
      revision: 2,
      preferences: { ...initial.preferences, dailyBudget: 2 },
    };
    const second = {
      ...initial,
      revision: 2,
      preferences: { ...initial.preferences, dailyBudget: 4 },
    };
    expect(
      await Promise.all([store.replace(1, first), store.replace(1, second)]),
    ).toEqual([true, false]);
    first.preferences.dailyBudget = 20;
    expect((await store.read()).preferences.dailyBudget).toBe(2);
  });
  it.each([
    { version: 99 },
    { revision: 0 },
    { nextId: -1 },
    { preferences: { dailyBudget: 100, timeZone: "UTC" } },
    { preferences: { dailyBudget: 5, timeZone: "invalid-zone" } },
    { unexpected: "private" },
    { rules: [{ enabled: "yes" }] },
    { inbox: [{ delivery: "delivered" }] },
  ])("rejects malformed external state %j", async (change) => {
    const initial = await createInMemoryAttentionStore({
      timeZone: "UTC",
    }).read();
    expect(() => parseAttentionState({ ...initial, ...change })).toThrow();
  });
});
