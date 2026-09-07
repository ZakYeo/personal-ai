import { createAttentionFeatureRegistryEntry } from "./attention-feature-adapters.js";
import { createRuntimeServiceRegistry } from "../runtime-service-registry.js";
import { attentionStoreService } from "../feature-source-services.js";
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
