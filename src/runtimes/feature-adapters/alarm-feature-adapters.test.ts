import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLoadedRuntimeConfig } from "../../test-support/core-assistant.js";
import {
  createConfiguredTextRuntime,
  createConfiguredTextRuntimeComposition,
} from "../configured-text-runtime.js";
import { parseAssistantConfig } from "../config/config.js";
import { createDefaultFeatureAdapterRegistry } from "../default-feature-adapter-registry.js";
import type { AlarmStoreFileSystem } from "../../adapters/local/file-alarm-store.js";
import { createFileAlarmStore } from "../../adapters/local/file-alarm-store.js";

describe("alarm feature adapters", () => {
  it("uses the configured runtime clock for alarm lifecycle timestamps", async () => {
    const now = new Date("2026-07-14T09:15:00.000Z");
    const directory = await mkdtemp(join(tmpdir(), "personal-ai-clock-"));
    const filePath = join(directory, "alarms.json");
    const composition = await createConfiguredTextRuntimeComposition({
      config: createLoadedRuntimeConfig({
        alarms: {
          adapter: "file",
          enabled: true,
          state: { path: filePath },
        },
      }),
      now: () => now,
    });

    await composition.assistant.handleText(
      "Hey Jarvis, set an alarm to ping me in 10 minutes.",
    );
    await composition.assistant.handleText("yes");
    const state = JSON.parse(await readFile(filePath, "utf8")) as {
      alarms: Array<{ createdAt: string; updatedAt: string }>;
    };

    expect(state.alarms[0]).toMatchObject({
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  });

  it("routes and persists a deterministic recurring alarm command", async () => {
    const now = new Date("2026-07-14T09:00:00.000Z");
    const directory = await mkdtemp(join(tmpdir(), "personal-ai-recurring-"));
    const filePath = join(directory, "alarms.json");
    const assistant = await createConfiguredTextRuntime({
      config: createLoadedRuntimeConfig({
        alarms: {
          adapter: "file",
          enabled: true,
          state: { path: filePath },
        },
      }),
      now: () => now,
    });

    await expect(
      assistant.handleText(
        "Hey Jarvis, set a daily alarm to take medicine in 10 minutes in Europe/London",
      ),
    ).resolves.toEqual({
      expectsFollowUp: true,
      status: "needs_confirmation",
      text: "Please confirm: 1. set the take medicine alarm for 2026-07-14T09:10:00.000Z, repeating daily in europe/london. Say yes or no.",
    });
    await assistant.handleText("yes");

    await expect(createFileAlarmStore({ filePath }).list()).resolves.toEqual([
      expect.objectContaining({
        label: "take medicine",
        recurrence: { frequency: "daily", timeZone: "Europe/London" },
        scheduledFor: "2026-07-14T09:10:00.000Z",
      }),
    ]);
  });

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
      text: "The tea alarm (persisted-alarm) is scheduled for 2026-07-13T17:00:00.000Z.",
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

  it("accepts narrow alarm state IO from configured runtime composition", async () => {
    const directory = await mkdtemp(join(tmpdir(), "personal-ai-config-"));
    const configPath = join(directory, "config.json");
    await writeFile(
      configPath,
      JSON.stringify(
        rawAlarmConfig({
          adapter: "file",
          enabled: true,
          state: { path: "/state/alarms.json" },
        }),
      ),
    );
    const stateFailure = new Error("controlled state read failure");
    const fileSystem: AlarmStoreFileSystem = {
      mkdir: () => Promise.resolve(),
      readFile: () => Promise.reject(stateFailure),
      replaceFile: () => Promise.resolve(),
    };
    const assistant = await createConfiguredTextRuntime({
      configPath,
      featureAdapterRegistry: createDefaultFeatureAdapterRegistry({
        alarmStore: { fileSystem },
      }),
    });

    const outcome = await assistant.handleTextWithDiagnostics(
      "Hey Jarvis, list my alarms",
    );

    expect(outcome.response).toEqual({
      status: "error",
      text: "I could not complete that command.",
    });
    const storeError = outcome.diagnostics?.[0]?.cause;
    expect(storeError).toBeInstanceOf(Error);
    if (!(storeError instanceof Error)) {
      throw new TypeError("Expected a configured alarm store failure.");
    }
    expect(storeError.cause).toBe(stateFailure);
  });

  it("resolves relative state paths from the loaded config directory", async () => {
    const directory = await mkdtemp(join(tmpdir(), "personal-ai-config-"));
    const configPath = join(directory, "config.json");
    const statePath = join(directory, "state", "alarms.json");
    await mkdir(join(directory, "state"));
    await writeFile(
      statePath,
      JSON.stringify({
        alarms: [
          {
            id: "relative-alarm",
            label: "tea",
            scheduledFor: "2026-07-13T17:00:00.000Z",
          },
        ],
        version: 1,
      }),
    );
    await writeFile(
      configPath,
      JSON.stringify(
        rawAlarmConfig({
          adapter: "file",
          enabled: true,
          state: { path: "state/alarms.json" },
        }),
      ),
    );

    const assistant = await createConfiguredTextRuntime({ configPath });

    const response = await assistant.handleText("Hey Jarvis, list my alarms");

    expect(response.text).toContain("relative-alarm");
  });

  it("rejects relative state paths for parsed config without a config directory", async () => {
    const config = createLoadedRuntimeConfig({
      alarms: {
        adapter: "file",
        enabled: true,
        state: { path: "state/alarms.json" },
      },
    });

    await expect(createConfiguredTextRuntime({ config })).rejects.toThrow(
      "Relative local state paths require a config directory.",
    );
  });
});

function rawAlarmConfig(alarmConfig: Record<string, unknown>) {
  return {
    assistant: {
      name: "Jarvis",
      timeZone: "Europe/London",
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
