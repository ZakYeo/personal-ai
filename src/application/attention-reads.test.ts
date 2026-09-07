import { readAttentionCandidates } from "./attention-reads.js";
import { createTestAttentionRule } from "../test-support/attention.js";

it("limits independent reads to four and abandons queued work on shutdown", async () => {
  const shutdown = new AbortController();
  const finish: Array<() => void> = [];
  const read = vi.fn(
    () =>
      new Promise<[]>((resolve) => {
        finish.push(() => resolve([]));
      }),
  );
  const rules = Array.from({ length: 6 }, (_, index) => ({
    ...createTestAttentionRule(),
    id: `rule-${index}`,
    definition: { kind: "due_tasks" as const, daysAhead: index },
  }));
  const result = readAttentionCandidates(
    rules,
    { read },
    new Date("2026-09-07T12:00:00.000Z"),
    shutdown.signal,
  );
  await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(4));
  shutdown.abort();
  finish.forEach((resolve) => resolve());
  expect(await result).toHaveLength(4);
  expect(read).toHaveBeenCalledTimes(4);
});
