import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLoadedRuntimeConfig } from "../../test-support/core-assistant.js";
import { createConfiguredTextRuntime } from "../configured-text-runtime.js";
import { parseAssistantConfig } from "../config/config.js";

describe("alarm feature adapters", () => {
  it("requires a nested state path for the file adapter", () => {
    expect(() =>
      parseAssistantConfig(
        rawAlarmConfig({
          adapter: "file",
          enabled: true,
          state: {},
        }),
      ),
    ).toThrow('Config feature "alarms".state.path must be a non-empty string.');
  });

  it("selects persisted alarms through configured runtime composition", async () => {
    const directory = await mkdtemp(join(tmpdir(), "personal-ai-alarms-"));
    const filePath = join(directory, "alarms.json");
    await writeFile(
      filePath,
      JSON.stringify({
        alarms: [
          {
            id: "persisted-alarm",
            label: "tea",
            scheduledFor: "2026-07-13T17:00:00.000Z",
          },
        ],
        version: 1,
      }),
    );
    const assistant = await createConfiguredTextRuntime({
      config: createLoadedRuntimeConfig({
        alarms: {
          adapter: "file",
          enabled: true,
          state: { path: filePath },
        },
      }),
    });

    await expect(
      assistant.handleText("Hey Jarvis, list my alarms"),
    ).resolves.toEqual({
      status: "ok",
      text: "Alarms: persisted-alarm at 2026-07-13T17:00:00.000Z (tea).",
    });
  });

  it("keeps malformed state details diagnostic-only", async () => {
    const directory = await mkdtemp(join(tmpdir(), "personal-ai-alarms-"));
    const filePath = join(directory, "alarms.json");
    await writeFile(filePath, "not json");
    const assistant = await createConfiguredTextRuntime({
      config: createLoadedRuntimeConfig({
        alarms: {
          adapter: "file",
          enabled: true,
          state: { path: filePath },
        },
      }),
    });

    const outcome = await assistant.handleTextWithDiagnostics(
      "Hey Jarvis, list my alarms",
    );

    expect(outcome.response).toEqual({
      status: "error",
      text: "I could not complete that command.",
    });
    expect(outcome.response.text).not.toContain(filePath);
    expect(outcome.diagnostics).toHaveLength(1);
    const diagnostic = outcome.diagnostics?.[0];
    expect(diagnostic).toMatchObject({
      capability: "alarm.list",
      category: "feature_failure",
    });
    expect(diagnostic?.cause).toBeInstanceOf(Error);
    if (!(diagnostic?.cause instanceof Error)) {
      throw new TypeError("Expected an alarm state diagnostic cause.");
    }
    expect(diagnostic.cause.message).toBe(
      "Alarm state file contains invalid JSON.",
    );
  });
});

function rawAlarmConfig(alarmConfig: Record<string, unknown>) {
  return {
    assistant: {
      name: "Jarvis",
      wakePhrases: ["hey jarvis"],
    },
    features: {
      alarms: alarmConfig,
    },
    intent: {
      provider: "deterministic",
    },
  };
}
