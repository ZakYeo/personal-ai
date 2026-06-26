import { createDeterministicRuntime } from "./deterministic-runtime.js";
import type { AssistantConfig } from "../ports/assistant.js";

const config: AssistantConfig = {
  assistant: {
    name: "Jarvis",
    wakePhrases: ["hey jarvis"],
  },
  features: {
    calendar: { enabled: true },
    messaging: { enabled: true },
    alarms: { enabled: true },
  },
};

describe("createDeterministicRuntime", () => {
  it("wires enabled features into the assistant", async () => {
    const assistant = await createDeterministicRuntime({
      config,
      now: new Date("2026-06-26T09:00:00.000Z"),
    });

    await expect(
      assistant.handleText(
        "Hey Jarvis, can you check my calendar for the date of the upcoming wedding please?",
      ),
    ).resolves.toEqual({
      status: "ok",
      text: "The upcoming wedding is on 2026-09-12.",
    });
  });

  it("respects disabled features from config", async () => {
    const assistant = await createDeterministicRuntime({
      config: {
        ...config,
        features: {
          ...config.features,
          calendar: { enabled: false },
        },
      },
    });

    await expect(
      assistant.handleText(
        "Hey Jarvis, can you check my calendar for the date of the upcoming wedding please?",
      ),
    ).resolves.toEqual({
      status: "unsupported",
      text: "I do not have an enabled feature for calendar.search_events.",
    });
  });

  it("keeps alarm state within one composed runtime", async () => {
    const assistant = await createDeterministicRuntime({
      config,
      now: new Date("2026-06-26T09:00:00.000Z"),
    });

    await assistant.handleText(
      "Hey Jarvis, set an alarm to ping me in 10 minutes.",
    );

    await expect(
      assistant.handleText("Hey Jarvis, list my alarms"),
    ).resolves.toEqual({
      status: "ok",
      text: "Alarms: alarm-1 at 2026-06-26T09:10:00.000Z (ping me).",
    });
  });

  it("requires confirmation for alarm creation in the default config", async () => {
    const assistant = await createDeterministicRuntime({
      now: new Date("2026-06-26T09:00:00.000Z"),
    });

    await expect(
      assistant.handleText(
        "Hey Jarvis, set an alarm to ping me in 10 minutes.",
      ),
    ).resolves.toEqual({
      status: "needs_confirmation",
      text: "I need confirmation before doing that. Please confirm yes or no.",
    });

    await expect(
      assistant.handleText("Hey Jarvis, list my alarms"),
    ).resolves.toEqual({
      status: "ok",
      text: "There are no alarms set.",
    });
  });
});
