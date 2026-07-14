import { createInMemoryAlarmStore } from "../../adapters/local/in-memory-alarm-store.js";
import {
  removeExpiredAlarmHistory,
  runAlarmRetention,
} from "./alarm-retention.js";

const retentionMs = 30 * 24 * 60 * 60_000;

describe("alarm retention", () => {
  it("removes only terminal history older than 30 days", async () => {
    const store = createInMemoryAlarmStore({
      now: () => new Date("2026-07-14T09:00:00.000Z"),
    });
    const terminal = await store.add({
      label: "old",
      scheduledFor: "2026-07-14T09:10:00.000Z",
    });
    await store.update({
      changes: { nextDeliveryAt: null, status: "cancelled" },
      expectedRevision: terminal.revision,
      id: terminal.id,
      updatedAt: "2026-07-14T09:00:00.000Z",
    });
    await store.add({
      label: "active",
      scheduledFor: "2026-09-01T09:00:00.000Z",
    });

    await expect(
      removeExpiredAlarmHistory({
        clock: { now: () => new Date("2026-08-14T09:00:00.000Z") },
        retentionMs,
        store,
      }),
    ).resolves.toBe(1);
    await expect(store.list()).resolves.toEqual([
      expect.objectContaining({ label: "active", status: "scheduled" }),
    ]);
  });

  it("runs cleanup immediately and stops its wait on shutdown", async () => {
    const shutdown = new AbortController();
    const cutoffs: string[] = [];

    await runAlarmRetention({
      clock: { now: () => new Date("2026-08-14T09:00:00.000Z") },
      intervalMs: 86_400_000,
      retentionMs,
      shutdownSignal: shutdown.signal,
      store: {
        add: () => Promise.reject(new Error("not used")),
        list: () => Promise.reject(new Error("not used")),
        removeTerminalBefore: (cutoff) => {
          cutoffs.push(cutoff);
          return Promise.resolve(0);
        },
        update: () => Promise.reject(new Error("not used")),
      },
      timer: {
        wait: () => {
          shutdown.abort();
          return Promise.resolve();
        },
      },
    });

    expect(cutoffs).toEqual(["2026-07-15T09:00:00.000Z"]);
  });

  it("preserves cleanup failures for the shared runtime boundary", async () => {
    const failure = new Error("private state failure");
    const shutdown = new AbortController();

    await expect(
      runAlarmRetention({
        clock: { now: () => new Date("2026-08-14T09:00:00.000Z") },
        intervalMs: 86_400_000,
        retentionMs,
        shutdownSignal: shutdown.signal,
        store: {
          add: () => Promise.reject(new Error("not used")),
          list: () => Promise.reject(new Error("not used")),
          removeTerminalBefore: () => Promise.reject(failure),
          update: () => Promise.reject(new Error("not used")),
        },
      }),
    ).rejects.toBe(failure);
  });
});
