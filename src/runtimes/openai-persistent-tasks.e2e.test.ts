import { access } from "node:fs/promises";
import { env } from "node:process";

import { createFileTaskStore } from "../adapters/local/file-task-store.js";
import { writePersistentTaskRuntimeConfig } from "../test-support/runtime-composition.js";
import { createConfiguredTextRuntime } from "./configured-text-runtime.js";

const now = new Date("2026-07-28T08:00:00.000Z");
const reminderAt = "2026-07-29T08:00:00.000Z";
const runOpenAIE2E = env.PERSONAL_AI_RUN_OPENAI_E2E === "1";

describe("OpenAI persistent task routing", () => {
  it("confirms one provider-decoded reminder and preserves it across restart", async () => {
    const { configPath, statePath } = await writePersistentTaskRuntimeConfig(
      createTaskConfig({
        apiKeyEnv: "OPENAI_API_KEY",
        baseUrl: "https://api.openai.test/v1",
        model: "gpt-5.5",
        timeoutMs: 30_000,
      }),
    );
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        intentResponse("intent-list", "task.list.create", [
          { name: "name", value: "To-do" },
        ]),
      )
      .mockResolvedValueOnce(
        intentResponse("intent-reminder", "task.remind", [
          { name: "label", value: "Submit the form" },
          { name: "listName", value: "To-do" },
          { name: "reminderAt", value: reminderAt },
        ]),
      )
      .mockResolvedValueOnce(
        intentResponse("intent-show", "task.list.show", [
          { name: "name", value: "To-do" },
        ]),
      );
    const createRuntime = () =>
      createConfiguredTextRuntime({
        configPath,
        env: { OPENAI_API_KEY: "test-api-key" },
        fetch,
        now: () => now,
      });
    const firstRuntime = await createRuntime();

    await expect(
      firstRuntime.handleText("Hey Jarvis, create a to-do list."),
    ).resolves.toEqual({
      status: "ok",
      text: "Created the To-do list.",
    });
    await expect(access(statePath)).resolves.toBeUndefined();
    await expect(
      firstRuntime.handleText(
        "Hey Jarvis, remind me tomorrow at 9 to submit the form.",
      ),
    ).resolves.toEqual({
      expectsFollowUp: true,
      status: "needs_confirmation",
      text: `Please confirm: 1. create Submit the form on the To-do list with a reminder for ${reminderAt}. Say yes or no.`,
    });
    await expect(
      createFileTaskStore({ filePath: statePath, now: () => now }).listTasks(),
    ).resolves.toEqual([]);

    await expect(firstRuntime.handleText("yes")).resolves.toEqual({
      expectsFollowUp: true,
      status: "ok",
      text: `Added Submit the form to your To-do list with a reminder for ${reminderAt}.`,
    });
    await expect(
      createFileTaskStore({ filePath: statePath, now: () => now }).listTasks(),
    ).resolves.toEqual([
      expect.objectContaining({
        label: "Submit the form",
        reminder: {
          scheduledFor: reminderAt,
          status: "scheduled",
        },
        status: "open",
      }),
    ]);

    const restartedRuntime = await createRuntime();
    await expect(
      restartedRuntime.handleText("Hey Jarvis, show my to-do list."),
    ).resolves.toEqual({
      expectsFollowUp: true,
      status: "ok",
      text: "Your To-do list has Submit the form.",
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://api.openai.test/v1/responses",
      expect.objectContaining({
        body: expect.stringContaining("task.remind") as string,
      }),
    );
  });

  it("confirms a provider-decoded create-list and reminder plan before either write", async () => {
    const { configPath, statePath } = await writePersistentTaskRuntimeConfig(
      createTaskConfig({
        apiKeyEnv: "OPENAI_API_KEY",
        baseUrl: "https://api.openai.test/v1",
        model: "gpt-5.5",
        timeoutMs: 30_000,
      }),
    );
    const fetch = vi.fn().mockResolvedValue(
      intentPlanResponse("intent-task-plan", [
        {
          capability: "task.list.create",
          parameters: [{ name: "name", value: "To-do" }],
        },
        {
          capability: "task.remind",
          parameters: [
            { name: "label", value: "Submit the form" },
            { name: "listName", value: "To-do" },
            { name: "reminderAt", value: reminderAt },
          ],
        },
      ]),
    );
    const assistant = await createConfiguredTextRuntime({
      configPath,
      env: { OPENAI_API_KEY: "test-api-key" },
      fetch,
      now: () => now,
    });

    await expect(
      assistant.handleText(
        "Hey Jarvis, create a to-do list and remind me tomorrow at 9 to submit the form.",
      ),
    ).resolves.toEqual({
      expectsFollowUp: true,
      status: "needs_confirmation",
      text: `Please confirm this plan: 1. create Submit the form on the To-do list with a reminder for ${reminderAt}. Say yes or no.`,
    });
    await expect(access(statePath)).rejects.toMatchObject({ code: "ENOENT" });

    await expect(assistant.handleText("yes")).resolves.toEqual({
      expectsFollowUp: true,
      status: "ok",
      text: `Created the To-do list. Added Submit the form to your To-do list with a reminder for ${reminderAt}.`,
    });
    const store = createFileTaskStore({ filePath: statePath, now: () => now });
    await expect(store.listLists()).resolves.toEqual([
      expect.objectContaining({ name: "To-do" }),
    ]);
    await expect(store.listTasks()).resolves.toEqual([
      expect.objectContaining({
        label: "Submit the form",
        reminder: expect.objectContaining({
          scheduledFor: reminderAt,
          status: "scheduled",
        }) as object,
      }),
    ]);
  });
});

describe.skipIf(!runOpenAIE2E)(
  "OpenAI persistent task routing live E2E",
  () => {
    it("routes and durably confirms a natural-language task reminder", async () => {
      const { configPath, statePath } = await writePersistentTaskRuntimeConfig(
        createTaskConfig({ model: "gpt-5.4-nano" }),
      );
      const assistant = await createConfiguredTextRuntime({
        configPath,
        env: { OPENAI_API_KEY: env.OPENAI_API_KEY },
        fetch: globalThis.fetch,
        now: () => now,
      });

      await expect(
        assistant.handleText("Hey Jarvis, create a to-do list."),
      ).resolves.toMatchObject({ status: "ok" });
      const confirmation = await assistant.handleText(
        "Hey Jarvis, remind me tomorrow at 9 to submit the form.",
      );
      expect(confirmation).toMatchObject({
        expectsFollowUp: true,
        status: "needs_confirmation",
      });
      expect(confirmation.text).toContain("Submit the form");
      expect(confirmation.text).toContain(reminderAt);
      await expect(assistant.handleText("yes")).resolves.toMatchObject({
        status: "ok",
      });
      await expect(
        createFileTaskStore({
          filePath: statePath,
          now: () => now,
        }).listTasks(),
      ).resolves.toEqual([
        expect.objectContaining({
          label: expect.stringMatching(/submit the form/iu) as string,
          reminder: expect.objectContaining({
            scheduledFor: reminderAt,
            status: "scheduled",
          }) as object,
        }),
      ]);
    }, 60_000);
  },
);

function createTaskConfig(openai: Record<string, unknown>) {
  return {
    assistant: {
      name: "Jarvis",
      timeZone: "Europe/London",
      wakePhrases: ["hey jarvis"],
    },
    conversation: {
      history: { maxTurnsBeforeCompaction: 5 },
      provider: "disabled",
    },
    features: {},
    intent: { openai, provider: "openai" },
    responseRewriter: { provider: "disabled" },
  };
}

function intentResponse(
  id: string,
  capability: string,
  parameters: Array<{ name: string; value: string }>,
) {
  return Promise.resolve(
    new Response(
      JSON.stringify({
        id,
        output_text: JSON.stringify({
          command: {
            capability,
            parameters,
            rawText: "provider-routed task request",
          },
          kind: "command",
          plan: null,
          response: null,
        }),
      }),
      { status: 200 },
    ),
  );
}

function intentPlanResponse(
  id: string,
  commands: Array<{
    capability: string;
    parameters: Array<{ name: string; value: string }>;
  }>,
) {
  return Promise.resolve(
    new Response(
      JSON.stringify({
        id,
        output_text: JSON.stringify({
          command: null,
          kind: "plan",
          plan: {
            commands: commands.map((command) => ({
              ...command,
              rawText: "provider-routed task plan",
            })),
          },
          response: null,
        }),
      }),
      { status: 200 },
    ),
  );
}
