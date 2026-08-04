import { createFileTaskStore } from "../adapters/local/file-task-store.js";
import { createLoadedRuntimeConfig } from "../test-support/core-assistant.js";
import {
  createConfiguredTextRuntimeHarness,
  writePersistentTaskRuntimeConfig,
} from "../test-support/runtime-composition.js";
import { createConfiguredTextRuntime } from "./configured-text-runtime.js";

const now = new Date("2026-07-28T08:00:00.000Z");
const taskConfig = createLoadedRuntimeConfig({
  tasks: { adapter: "local", enabled: true },
});

describe("task compound plans", () => {
  it("executes three validated task stages in order", async () => {
    const assistant = await createConfiguredTextRuntimeHarness({
      config: taskConfig,
      now: () => now,
    });

    await expect(
      assistant.handleText(
        "Hey Jarvis, create a shopping list then add coffee to my shopping list then show my shopping list",
      ),
    ).resolves.toEqual({
      status: "ok",
      text: "Created the shopping list. Added coffee to your shopping list. Your shopping list has coffee.",
    });
  });

  it("executes no task write until the whole high-risk plan is confirmed", async () => {
    const { assistant, store } = await createPersistentRuntime();
    await assistant.handleText("Hey Jarvis, create a shopping list");

    await expect(
      assistant.handleText(
        "Hey Jarvis, add coffee to my shopping list then clear my shopping list",
      ),
    ).resolves.toEqual({
      expectsFollowUp: true,
      status: "needs_confirmation",
      text: "Please confirm this plan: 1. clear every task from the shopping list. Say yes or no.",
    });
    await expect(store.listTasks()).resolves.toEqual([]);

    await expect(assistant.handleText("yes")).resolves.toEqual({
      status: "ok",
      text: "Added coffee to your shopping list. Cleared 1 tasks from your shopping list.",
    });
    await expect(store.listTasks()).resolves.toEqual([]);
  });

  it("stops after a failed middle write and identifies the skipped stage", async () => {
    const { assistant, store } = await createPersistentRuntime();

    await expect(
      assistant.handleText(
        "Hey Jarvis, create a shopping list then create a shopping list then create a groceries list",
      ),
    ).resolves.toEqual({
      status: "error",
      text: "Created the shopping list. I could not complete this step: Create a named personal list. I did not attempt this remaining step: Create a named personal list.",
    });
    await expect(store.listLists()).resolves.toEqual([
      expect.objectContaining({ name: "shopping" }),
    ]);
  });
});

async function createPersistentRuntime() {
  const { configPath, statePath } =
    await writePersistentTaskRuntimeConfig(rawTaskConfig());
  return {
    assistant: await createConfiguredTextRuntime({
      configPath,
      env: {},
      fetch: () => Promise.reject(new Error("Unexpected task plan fetch.")),
      now: () => now,
    }),
    store: createFileTaskStore({ filePath: statePath, now: () => now }),
  };
}

function rawTaskConfig() {
  return {
    assistant: {
      name: "Jarvis",
      timeZone: "Europe/London",
      wakePhrases: ["hey jarvis"],
    },
    conversation: { provider: "disabled" },
    features: {},
    intent: { provider: "deterministic" },
    responseRewriter: { provider: "disabled" },
  };
}
