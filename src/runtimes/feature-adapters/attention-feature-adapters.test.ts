import { createTestTaskStore } from "../../test-support/task-store.js";
import {
  bindRuntimeService,
  createRuntimeServiceRegistry,
} from "../runtime-service-registry.js";
import {
  taskStoreService,
  attentionStoreService,
} from "../feature-source-services.js";
import { createAttentionFeatureRegistryEntry } from "./attention-feature-adapters.js";
import { enableAttentionRule } from "../../application/attention-commands.js";

it("shares one store with the feature and long-running retention even without notification output", async () => {
  const resolved = createAttentionFeatureRegistryEntry().adapters.local!.parse({
    timeZone: "Europe/London",
  });
  const runtime = {
    clock: { now: () => new Date("2026-09-07T12:00:00.000Z") },
  };
  const services = createRuntimeServiceRegistry(
    resolved.provideServices?.(runtime) ?? [],
  );
  const store = services.require(attentionStoreService);
  expect((await store.read()).rules).toEqual([]);
  await enableAttentionRule(
    store,
    {
      name: "Health",
      definition: { kind: "runtime_health" },
      timeZone: "Europe/London",
      request: "Watch for problems",
    },
    runtime.clock.now(),
  );
  const composition = resolved.create(runtime, services);
  expect(
    "backgroundTasks" in composition &&
      composition.backgroundTasks?.map((task) => task.id),
  ).toEqual(["attention.evaluate"]);
  if (!("backgroundTasks" in composition))
    throw new Error("Expected background composition");
  const shutdown = new AbortController();
  const wait = vi.fn(() => {
    shutdown.abort();
    return Promise.resolve();
  });
  await composition.backgroundTasks[0]!.run({
    ...runtime,
    shutdownSignal: shutdown.signal,
    timer: { wait },
    reportFailure: () => {},
  });
  expect((await store.read()).evaluations[0]?.completed?.reason).toBe(
    "no_match",
  );
  expect(wait).toHaveBeenCalledWith(60_000, shutdown.signal);
});
it("requires explicit timezone and resolves file state relative to the selected config", () => {
  const registry = createAttentionFeatureRegistryEntry({
    configDirectory: "/tmp/attention-config",
  });
  expect(() => registry.adapters.local!.parse({})).toThrow("timezone");
  expect(
    registry.adapters
      .file!.parse({
        timeZone: "Europe/London",
        state: { path: "state/attention.json" },
      })
      .inspect?.().statePaths,
  ).toEqual(["state/attention.json"]);
});

it("reports task source failure through health using the exact shared composed store, then recovers", async () => {
  const resolved = createAttentionFeatureRegistryEntry().adapters.local!.parse({
    timeZone: "Europe/London",
  });
  let instant = new Date("2026-09-07T12:00:00.000Z");
  const runtime = { clock: { now: () => instant } };
  const tasks = createTestTaskStore();
  const failure = new Error("private task store unavailable");
  tasks.listTasks = vi.fn(() => Promise.reject(failure));
  const services = createRuntimeServiceRegistry([
    ...(resolved.provideServices?.(runtime) ?? []),
    bindRuntimeService(taskStoreService, tasks),
  ]);
  const store = services.require(attentionStoreService);
  for (const definition of [
    { kind: "runtime_health" } as const,
    { kind: "due_tasks", daysAhead: 0 } as const,
  ])
    await enableAttentionRule(
      store,
      {
        name: definition.kind,
        definition,
        timeZone: "Europe/London",
        request: "Notify me about problems and due tasks",
      },
      instant,
    );
  const composition = resolved.create(runtime, services);
  if (!("backgroundTasks" in composition))
    throw new Error("Expected background composition");
  const shutdown = new AbortController();
  let cycles = 0;
  let problemSeenBeforeRecovery = false;
  const diagnostics = vi.fn();
  await composition.backgroundTasks[0]!.run({
    ...runtime,
    shutdownSignal: shutdown.signal,
    reportFailure: diagnostics,
    timer: {
      wait: async () => {
        cycles += 1;
        instant = new Date(instant.getTime() + 60_000);
        if (cycles === 2) {
          problemSeenBeforeRecovery = (await store.read()).inbox.some(
            (item) => item.facts.problem === "source_unavailable",
          );
          tasks.listTasks = () => Promise.resolve([]);
        }
        if (cycles === 4) shutdown.abort();
        return Promise.resolve();
      },
    },
  });
  expect(problemSeenBeforeRecovery).toBe(true);
  expect(
    (await store.read()).inbox.some(
      (item) => item.facts.problem === "source_unavailable",
    ),
  ).toBe(true);
  expect(
    (await store.read()).evaluations.every(
      (entry) => entry.completed?.reason === "no_match",
    ),
  ).toBe(true);
  expect(diagnostics).toHaveBeenCalledWith(failure);
});
