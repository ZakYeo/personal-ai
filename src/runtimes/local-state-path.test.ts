import { resolveLocalStatePath } from "./local-state-path.js";

describe("resolveLocalStatePath", () => {
  it("preserves normalized absolute paths", () => {
    expect(
      resolveLocalStatePath("/var/lib/personal-ai/../personal-ai/alarms.json"),
    ).toBe("/var/lib/personal-ai/alarms.json");
  });

  it("resolves relative paths from the config directory", () => {
    expect(resolveLocalStatePath("state/alarms.json", "/etc/personal-ai")).toBe(
      "/etc/personal-ai/state/alarms.json",
    );
  });

  it("rejects relative paths without config source context", () => {
    expect(() => resolveLocalStatePath("state/alarms.json")).toThrow(
      "Relative local state paths require a config directory.",
    );
  });
});
