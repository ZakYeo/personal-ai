import { parseAssistantConfig } from "../config/config.js";
import { createLoadedRuntimeConfig } from "../../test-support/core-assistant.js";
import { inspectRuntimeConfiguration } from "./configuration-inspection.js";

describe("operator setup inspection", () => {
  it("reports each remote feature surface and local nested defaults", () => {
    const config = createLoadedRuntimeConfig({
      calendar: {
        enabled: true,
        adapter: "google",
        google: { calendarId: "private-calendar" },
      },
      weather: { enabled: true, adapter: "openMeteo" },
      internetSearch: {
        enabled: true,
        adapter: "openai",
        openai: { model: "private-model" },
      },
    });
    const report = inspectRuntimeConfiguration({ config }).join("\n");
    expect(report).toContain("Calendar reads: remote");
    expect(report).toContain("Weather forecasts: remote");
    expect(report).toContain("Internet search: remote");
    expect(report).toContain("Event grouping: local");
    expect(report).toContain("Clothing advice: local");
    expect(report).not.toMatch(/private-calendar|private-model/);
  });

  it("uses voice provider declarations and leaves operator programs unchecked", () => {
    const base = createLoadedRuntimeConfig({});
    const config = parseAssistantConfig({
      assistant: base.assistant,
      intent: { provider: "deterministic" },
      conversation: {
        provider: "disabled",
        history: { maxTurnsBeforeCompaction: 5 },
      },
      responseRewriter: { provider: "disabled" },
      features: {},
      voice: {
        speechToText: "command",
        streamingTextToSpeech: "openai-streaming",
      },
      desktopVoice: {
        speechToText: {
          command: "private-program",
          args: ["private-argument"],
        },
        openAIStreamingSpeech: {
          model: "private-model",
          voice: "alloy",
          apiKeyEnv: "PRIVATE_KEY",
          baseUrl: "https://private.example/v1",
        },
      },
    });
    const report = inspectRuntimeConfiguration({ config }).join("\n");
    expect(report).toContain(
      "Voice speechToText: command (operator configured; unchecked)",
    );
    expect(report).toContain(
      "Voice streamingTextToSpeech: openai-streaming (remote)",
    );
    expect(report).not.toMatch(
      /private-program|private-argument|private-model|PRIVATE_KEY|private\.example/,
    );
  });

  it("declares nested remote processing without exposing provider configuration", () => {
    const remote = {
      provider: "openai",
      openai: {
        model: "private-model",
        apiKeyEnv: "PRIVATE_KEY",
        baseUrl: "https://private.example/v1",
      },
    };
    const config = createLoadedRuntimeConfig({
      calendar: { enabled: true, adapter: "mock", eventGrouping: remote },
      weather: { enabled: true, adapter: "mock", clothingAdvisor: remote },
    });
    const report = inspectRuntimeConfiguration({ config }).join("\n");
    expect(report).toContain("Calendar reads: local");
    expect(report).toContain("Event grouping: remote");
    expect(report).toContain("Weather forecasts: local");
    expect(report).toContain("Clothing advice: remote");
    expect(report).not.toMatch(/private-model|PRIVATE_KEY|private\.example/);
  });

  it("does not report nested processing for disabled features", () => {
    const config = createLoadedRuntimeConfig({
      calendar: { enabled: false },
      weather: { enabled: false },
    });
    const report = inspectRuntimeConfiguration({ config }).join("\n");
    expect(report).toContain("calendar: disabled");
    expect(report).not.toMatch(/Event grouping|Clothing advice/);
  });
  it("shows declared durable paths relative to the selected config without constructing adapters", () => {
    const config = createLoadedRuntimeConfig({
      alarms: {
        enabled: true,
        adapter: "file",
        state: { path: "state/alarms.json" },
      },
      profile: {
        enabled: true,
        adapter: "file",
        state: { path: "state/profile.json" },
      },
      tasks: {
        enabled: true,
        adapter: "file",
        state: { path: "state/tasks.json" },
      },
      briefing: {
        enabled: true,
        adapter: "file",
        state: { path: "state/briefing.json" },
      },
    });
    const lines = inspectRuntimeConfiguration({
      config,
      configDirectory: "/tmp/setup",
    });
    expect(lines.join("\n")).toContain("/tmp/setup/state/alarms.json");
    expect(lines.join("\n")).toContain("/tmp/setup/state/profile.json");
    expect(lines.join("\n")).toContain("/tmp/setup/state/tasks.json");
    expect(lines.join("\n")).toContain("/tmp/setup/state/briefing.json");
    expect(lines.join("\n")).toContain("No integration checks have run.");
    expect(lines.join("\n")).toContain("Intent: deterministic (local)");
  });
});
