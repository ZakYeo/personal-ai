import {
  createTestAttentionStore,
  createTestAttentionRule,
  createTestAttentionItem,
} from "../test-support/attention.js";
import { processAttentionCycle } from "./attention-engine.js";
import { createAttentionHealthSource } from "./attention-health-source.js";
import type { AttentionRule } from "../ports/attention.js";

const now = new Date("2026-09-07T12:00:00.000Z");
const candidate = {
  key: "due-task",
  text: "Review the plan is due.",
  explanation: "An open task reached its due date.",
  timeZone: "Europe/London",
  facts: { label: "Review the plan", dueDate: "2026-09-07" },
};

async function harness(rules: AttentionRule[] = [createTestAttentionRule()]) {
  const store = createTestAttentionStore({ timeZone: "Europe/London" });
  const state = await store.read();
  await store.replace(1, { ...state, revision: 2, nextId: 20, rules });
  const read = vi.fn(() => Promise.resolve([candidate]));
  const delivered: string[] = [];
  const deliver = vi.fn(async ({ id }: { id: string }) => {
    expect(
      (await store.read()).inbox.find((item) => item.id === id)?.delivery
        .status,
    ).toBe("unknown");
    delivered.push(id);
  });
  const reportFailure = vi.fn();
  return {
    store,
    read,
    delivered,
    deliver,
    reportFailure,
    run: (time = now, signal?: AbortSignal) =>
      processAttentionCycle({
        store,
        reader: { read },
        delivery: { deliver },
        clock: { now: () => time },
        reportFailure,
        ...(signal ? { signal } : {}),
      }),
  };
}

describe("durable proactive attention evaluation", () => {
  it("keeps completed source failures visible to health while the next slot is reading", async () => {
    const task = createTestAttentionRule();
    const h = await harness([
      task,
      {
        ...task,
        id: "health",
        name: "Health",
        definition: { kind: "runtime_health" },
      },
    ]);
    const health = createAttentionHealthSource({
      attention: h.store,
      timeZone: "Europe/London",
    });
    let failed = true;
    const reader = {
      read: (
        request: { definition: AttentionRule["definition"] },
        context: { now: Date },
      ) => {
        if (request.definition.kind === "runtime_health")
          return health.read(context.now);
        if (!failed) return Promise.resolve([]);
        throw new Error("private source failure");
      },
    };
    for (let minute = 0; minute < 3; minute += 1) {
      await processAttentionCycle({
        store: h.store,
        reader,
        delivery: { deliver: h.deliver },
        clock: { now: () => new Date(now.getTime() + minute * 60_000) },
        reportFailure: h.reportFailure,
      });
    }
    expect(h.deliver).toHaveBeenCalledOnce();
    expect((await h.store.read()).inbox[0]?.facts.problem).toBe(
      "source_unavailable",
    );
    failed = false;
    for (let minute = 3; minute < 5; minute += 1) {
      await processAttentionCycle({
        store: h.store,
        reader,
        delivery: { deliver: h.deliver },
        clock: { now: () => new Date(now.getTime() + minute * 60_000) },
        reportFailure: h.reportFailure,
      });
    }
    expect(
      (await h.store.read()).evaluations.every(
        (entry) => entry.completed?.reason === "no_match",
      ),
    ).toBe(true);
    expect(h.deliver).toHaveBeenCalledOnce();
  });
  it("performs no source read or notification without an explicitly enabled rule", async () => {
    const h = await harness([{ ...createTestAttentionRule(), enabled: false }]);
    await h.run();
    expect(h.read).not.toHaveBeenCalled();
    expect(h.deliver).not.toHaveBeenCalled();
  });
  it("claims before output, records completion separately from acknowledgement, and deduplicates after restart", async () => {
    const h = await harness();
    await h.run();
    expect((await h.store.read()).inbox).toMatchObject([
      { status: "open", delivery: { status: "delivered" } },
    ]);
    await h.run();
    await h.run(new Date("2026-09-07T12:01:00.000Z"));
    expect(h.deliver).toHaveBeenCalledOnce();
    expect(h.read).toHaveBeenCalledTimes(2);
  });
  it("never replays uncertain output even when diagnostic reporting also fails", async () => {
    const h = await harness();
    h.deliver.mockRejectedValue(new Error("private output failure"));
    h.reportFailure.mockImplementation(() => {
      throw new Error("logger failed");
    });
    await h.run();
    await h.run(new Date("2026-09-07T14:00:00.000Z"));
    expect(h.deliver).toHaveBeenCalledOnce();
    expect((await h.store.read()).inbox).toMatchObject([
      { status: "open", delivery: { status: "unknown" } },
    ]);
  });
  it("retains a quiet-hour inbox result and delivers only a refreshed match after quiet hours", async () => {
    const h = await harness();
    await h.run(new Date("2026-09-07T21:00:00.000Z"));
    expect(h.deliver).not.toHaveBeenCalled();
    expect((await h.store.read()).inbox).toMatchObject([
      { delivery: { status: "not_sent", reason: "quiet_hours" } },
    ]);
    h.read.mockResolvedValue([]);
    await h.run(new Date("2026-09-08T07:00:00.000Z"));
    expect(h.deliver).not.toHaveBeenCalled();
  });
  it("preserves unchanged suppressed notice revisions and batches policy reconciliation", async () => {
    const h = await harness();
    h.read.mockResolvedValue(
      Array.from({ length: 10 }, (_, index) => ({
        ...candidate,
        key: `task-${index}`,
      })),
    );
    await h.run(new Date("2026-09-07T21:00:00.000Z"));
    const previous = (await h.store.read()).inbox;
    const replace = vi.spyOn(h.store, "replace");
    await h.run(new Date("2026-09-07T21:01:00.000Z"));
    expect((await h.store.read()).inbox).toEqual(previous);
    expect(replace).toHaveBeenCalledTimes(2);
    h.read.mockResolvedValue([
      {
        ...candidate,
        key: "task-0",
        text: "Review the revised plan.",
        facts: { ...candidate.facts, label: "Revised plan" },
      },
    ]);
    await h.run(new Date("2026-09-07T21:02:00.000Z"));
    const changed = (await h.store.read()).inbox.find(
      (item) => item.facts.label === "Revised plan",
    )!;
    expect(changed.revision).toBe(
      previous.find((item) => item.id === changed.id)!.revision + 1,
    );
    expect(changed.observedAt).toBe("2026-09-07T21:02:00.000Z");
    expect(changed.delivery).toEqual({
      status: "not_sent",
      reason: "quiet_hours",
    });
    await h.run(new Date("2026-09-08T07:00:00.000Z"));
    expect(h.deliver).toHaveBeenCalledOnce();
  });
  it("shares identical reads and delivers the higher-priority match first under a one-item budget", async () => {
    const task = createTestAttentionRule();
    const health: AttentionRule = {
      ...task,
      id: "health",
      name: "Runtime problems",
      definition: { kind: "runtime_health" },
    };
    const h = await harness([
      task,
      { ...task, id: "other-task", name: "Other tasks" },
      health,
    ]);
    const state = await h.store.read();
    await h.store.replace(state.revision, {
      ...state,
      revision: state.revision + 1,
      preferences: { ...state.preferences, dailyBudget: 1 },
    });
    await h.run();
    expect(h.read).toHaveBeenCalledTimes(2);
    expect(
      (await h.store.read()).inbox.find((item) => item.id === h.delivered[0])
        ?.ruleId,
    ).toBe("health");
    expect(h.delivered).toHaveLength(1);
  });
  it("stops queued reads and output on shutdown", async () => {
    const h = await harness();
    const controller = new AbortController();
    h.read.mockImplementation(() => {
      controller.abort();
      return Promise.resolve([candidate]);
    });
    await h.run(now, controller.signal);
    expect(h.deliver).not.toHaveBeenCalled();
    expect((await h.store.read()).inbox).toEqual([]);
  });
  it("does not let a slower prior slot overwrite a newer evaluation", async () => {
    const h = await harness();
    let finish!: (value: (typeof candidate)[]) => void;
    h.read.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const first = h.run();
    await vi.waitFor(() => expect(h.read).toHaveBeenCalledOnce());
    h.read.mockResolvedValue([]);
    await h.run(new Date("2026-09-07T12:01:00.000Z"));
    finish([candidate]);
    await first;
    expect(h.deliver).not.toHaveBeenCalled();
    expect((await h.store.read()).evaluations[0]?.completed?.reason).toBe(
      "no_match",
    );
  });
  it("isolates a failed source while recording a safe evaluation reason", async () => {
    const task = createTestAttentionRule();
    const h = await harness([
      task,
      {
        ...task,
        id: "health",
        name: "Health",
        definition: { kind: "runtime_health" },
      },
    ]);
    h.read.mockRejectedValueOnce(new Error("private provider details"));
    await h.run();
    expect(h.deliver).toHaveBeenCalledOnce();
    expect(h.reportFailure).toHaveBeenCalledOnce();
    expect(
      (await h.store.read()).evaluations.some(
        (evaluation) => evaluation.completed?.reason === "source_unavailable",
      ),
    ).toBe(true);
  });
  it("isolates duplicate candidate keys before persistence while another rule proceeds", async () => {
    const task = createTestAttentionRule();
    const h = await harness([
      task,
      {
        ...task,
        id: "health",
        name: "Health",
        definition: { kind: "runtime_health" },
      },
    ]);
    await h.run(new Date("2026-09-07T21:00:00.000Z"));
    h.read.mockResolvedValueOnce([candidate, candidate]);
    await expect(
      h.run(new Date("2026-09-08T07:00:00.000Z")),
    ).resolves.toBeUndefined();
    expect(h.reportFailure).toHaveBeenCalledOnce();
    expect(h.deliver).toHaveBeenCalledOnce();
    expect(
      (await h.store.read()).evaluations.find(
        (entry) => entry.ruleId === task.id,
      )?.completed?.reason,
    ).toBe("source_unavailable");
  });
  it("does not start output when shutdown arrives during the durable claim", async () => {
    const h = await harness();
    const shutdown = new AbortController();
    const replace = h.store.replace.bind(h.store);
    h.store.replace = async (revision, state) => {
      const saved = await replace(revision, state);
      if (
        saved &&
        state.inbox.some((item) => item.delivery.status === "unknown")
      )
        shutdown.abort();
      return saved;
    };
    await h.run(now, shutdown.signal);
    expect(h.deliver).not.toHaveBeenCalled();
    expect((await h.store.read()).inbox[0]?.delivery.status).toBe("unknown");
  });
  it("makes room for higher-priority notices without discarding claimed delivery history", async () => {
    const task = createTestAttentionRule();
    const health: AttentionRule = {
      ...task,
      id: "health",
      name: "Health",
      definition: { kind: "runtime_health" },
    };
    const h = await harness([{ ...task, enabled: false }, health]);
    const state = await h.store.read();
    const inbox = Array.from({ length: 256 }, (_, index) => ({
      ...createTestAttentionItem(),
      id: `old-${index}`,
      key: `old-${index}`,
      delivery:
        index === 0
          ? { status: "unknown" as const, attemptedAt: now.toISOString() }
          : { status: "not_sent" as const, reason: "quiet_hours" as const },
    }));
    await h.store.replace(state.revision, {
      ...state,
      revision: state.revision + 1,
      nextId: 1_000,
      inbox,
    });
    await h.run();
    expect(h.deliver).toHaveBeenCalledOnce();
    const saved = await h.store.read();
    expect(saved.inbox).toHaveLength(256);
    expect(saved.inbox.some((item) => item.id === "old-0")).toBe(true);
    expect(saved.inbox.some((item) => item.ruleId === "health")).toBe(true);
  });
});
