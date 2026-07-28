import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createLoadedRuntimeConfig } from "../../test-support/core-assistant.js";
import {
  createFeatureContext,
  executeFeature,
} from "../../test-support/feature-contract.js";
import {
  loadConfigWithSource,
  parseAssistantConfig,
} from "../config/config.js";
import { createDefaultFeatureAdapterRegistry } from "../default-feature-adapter-registry.js";
import { createConfiguredFeatures } from "../feature-adapter-selection.js";

const taskNow = new Date("2026-07-28T09:00:00.000Z");

describe("task feature adapters", () => {
  it("composes the deterministic in-memory task adapter", () => {
    const config = createLoadedRuntimeConfig({
      tasks: { adapter: "local", enabled: true },
    });

    expect(createFeatures(config).map((feature) => feature.id)).toEqual([
      "tasks",
      "assistant",
    ]);
  });

  it("requires a nested state path for the file adapter", () => {
    expect(() =>
      parseAssistantConfig(
        rawTaskConfig({
          adapter: "file",
          enabled: true,
          state: {},
        }),
      ),
    ).toThrow('Config feature "tasks".state.path must be a non-empty string.');
  });

  it("captures typed file config without exposing raw state downstream", () => {
    const config = parseAssistantConfig(
      rawTaskConfig({
        adapter: "file",
        enabled: true,
        state: { path: "/state/tasks.json" },
      }),
    );

    expect(config.features.tasks).toMatchObject({
      adapter: "file",
      enabled: true,
    });
    expect(config.features.tasks).not.toHaveProperty("state");
  });

  it("persists task state relative to the selected config file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "personal-ai-tasks-"));
    const configPath = join(directory, "config.json");
    const statePath = join(directory, "state", "tasks.json");
    await writeFile(
      configPath,
      JSON.stringify(
        rawTaskConfig({
          adapter: "file",
          enabled: true,
          state: { path: "state/tasks.json" },
        }),
      ),
    );
    const firstSource = await loadConfigWithSource({ configPath });
    const firstFeature = createFeatures(
      firstSource.config,
      firstSource.configDirectory,
    ).find((feature) => feature.id === "tasks");
    if (!firstFeature) throw new Error("Expected the task feature.");
    const context = createFeatureContext();
    await executeFeature(
      firstFeature,
      "task.list.create",
      { name: "To-do" },
      context,
    );
    await executeFeature(
      firstFeature,
      "task.create",
      { label: "Submit the form", listName: "To-do" },
      context,
    );

    const restartedSource = await loadConfigWithSource({ configPath });
    const restartedFeature = createFeatures(
      restartedSource.config,
      restartedSource.configDirectory,
    ).find((feature) => feature.id === "tasks");
    if (!restartedFeature) throw new Error("Expected the task feature.");
    const response = await executeFeature(
      restartedFeature,
      "task.list.show",
      { name: "To-do" },
      context,
    );
    const state = JSON.parse(await readFile(statePath, "utf8")) as {
      lists: unknown[];
      tasks: unknown[];
      version: number;
    };

    expect(response.text).toContain("Submit the form");
    expect(state).toMatchObject({ version: 2 });
    expect(state.lists).toHaveLength(1);
    expect(state.tasks).toHaveLength(1);
  });

  it("rejects a relative state path without config source context", () => {
    const config = createLoadedRuntimeConfig({
      tasks: {
        adapter: "file",
        enabled: true,
        state: { path: "state/tasks.json" },
      },
    });

    expect(() => createFeatures(config)).toThrow(
      "Relative local state paths require a config directory.",
    );
  });

  it("accepts injected narrow task-state IO", async () => {
    const stateFailure = new Error("controlled task state failure");
    const registry = createDefaultFeatureAdapterRegistry({
      taskStore: {
        fileSystem: {
          mkdir: () => Promise.resolve(),
          readFile: () => Promise.reject(stateFailure),
          replaceFile: () => Promise.resolve(),
        },
      },
    });
    const config = parseAssistantConfig(
      rawTaskConfig({
        adapter: "file",
        enabled: true,
        state: { path: "/state/tasks.json" },
      }),
      { featureAdapterRegistry: registry },
    );
    const feature = createFeatures(config).find(
      (candidate) => candidate.id === "tasks",
    );
    if (!feature) throw new Error("Expected the task feature.");

    await expect(
      executeFeature(feature, "task.list.show", {}, createFeatureContext()),
    ).rejects.toMatchObject({
      cause: stateFailure,
      message: "Could not read task state.",
    });
  });
});

function createFeatures(
  config: ReturnType<typeof parseAssistantConfig>,
  configDirectory?: string,
) {
  return createConfiguredFeatures(config, {
    dependencies: {
      clock: { now: () => taskNow },
      ...(configDirectory ? { configDirectory } : {}),
      env: {},
      fetch: vi.fn() as typeof fetch,
    },
  });
}

function rawTaskConfig(tasks: Record<string, unknown>) {
  return {
    assistant: {
      name: "Jarvis",
      timeZone: "Europe/London",
      wakePhrases: ["hey jarvis"],
    },
    features: { tasks },
    intent: { provider: "deterministic" },
  };
}
