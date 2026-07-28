import { createLoadedRuntimeConfig } from "../test-support/core-assistant.js";
import { createConfiguredTextRuntimeHarness } from "../test-support/runtime-composition.js";

const taskConfig = createLoadedRuntimeConfig({
  tasks: { adapter: "local", enabled: true },
});

describe("deterministic task runtime", () => {
  it("enables local personal lists in the default runtime", async () => {
    const assistant = await createConfiguredTextRuntimeHarness({
      useRuntimeDefaultConfig: true,
    });

    await expect(
      assistant.handleText("Hey Jarvis, create a shopping list"),
    ).resolves.toEqual({
      status: "ok",
      text: "Created the shopping list.",
    });
  });

  it("summarizes the task feature once in the spoken default catalog", async () => {
    const assistant = await createConfiguredTextRuntimeHarness({
      useRuntimeDefaultConfig: true,
    });

    const response = await assistant.handleText("Hey Jarvis, what can you do");

    expect(response).toMatchObject({ status: "ok" });
    expect(response.text).toContain(
      "manage personal lists, tasks, and reminders",
    );
    expect(
      response.text.match(/personal lists, tasks, and reminders/gu),
    ).toHaveLength(1);
  });

  it("creates, shows, and completes an opaque task follow-up", async () => {
    const assistant = await createConfiguredTextRuntimeHarness({
      config: taskConfig,
    });

    await expect(
      assistant.handleText("Hey Jarvis, create a shopping list"),
    ).resolves.toEqual({
      status: "ok",
      text: "Created the shopping list.",
    });
    await assistant.handleText("Hey Jarvis, add coffee to my shopping list");
    await assistant.handleText("Hey Jarvis, add oat milk to my shopping list");
    await expect(
      assistant.handleText("Hey Jarvis, show my shopping list"),
    ).resolves.toEqual({
      expectsFollowUp: true,
      status: "ok",
      text: "Your shopping list has coffee and oat milk.",
    });
    await expect(
      assistant.handleText("complete the second one"),
    ).resolves.toEqual({
      status: "ok",
      text: "Completed oat milk on your shopping list.",
    });
  });

  it("resumes the exact validated task reminder after confirmation", async () => {
    const assistant = await createConfiguredTextRuntimeHarness({
      config: taskConfig,
    });
    await assistant.handleText("Hey Jarvis, create a to-do list");

    await expect(
      assistant.handleText(
        "Hey Jarvis, remind me at 2026-07-29T08:00:00.000Z to submit the form on my to-do list",
      ),
    ).resolves.toEqual({
      expectsFollowUp: true,
      status: "needs_confirmation",
      text: "Please confirm: 1. create submit the form on the to-do list with a reminder for 2026-07-29T08:00:00.000Z. Say yes or no.",
    });
    await expect(assistant.handleText("yes")).resolves.toEqual({
      expectsFollowUp: true,
      status: "ok",
      text: "Added submit the form to your to-do list with a reminder for 2026-07-29T08:00:00.000Z.",
    });
  });
});
