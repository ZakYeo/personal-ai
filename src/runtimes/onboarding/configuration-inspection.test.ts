import { createLoadedRuntimeConfig } from "../../test-support/core-assistant.js";
import { inspectRuntimeConfiguration } from "./configuration-inspection.js";

describe("operator setup inspection", () => {
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
