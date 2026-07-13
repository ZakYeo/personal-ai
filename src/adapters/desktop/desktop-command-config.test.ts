import type { DesktopCommandConfig } from "./desktop-command-config.js";

describe("DesktopCommandConfig", () => {
  it("describes command execution without depending on assistant ports", () => {
    const config = {
      args: ["--quiet"],
      command: "speaker",
      timeoutMs: 1_000,
    } satisfies DesktopCommandConfig;

    expect(config.command).toBe("speaker");
  });
});
