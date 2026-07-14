import {
  resolveDesktopCommandEnvironment,
  type DesktopCommandConfig,
} from "./desktop-command-config.js";

describe("DesktopCommandConfig", () => {
  it("describes command execution without depending on assistant ports", () => {
    const config = {
      args: ["--quiet"],
      command: "speaker",
      timeoutMs: 1_000,
    } satisfies DesktopCommandConfig;

    expect(config.command).toBe("speaker");
  });

  it("passes only safe variables and explicitly allowlisted credentials", () => {
    expect(
      resolveDesktopCommandEnvironment(
        {
          command: "/bin/sh",
          environmentAllowlist: ["OPENAI_API_KEY"],
        },
        {
          GOOGLE_CALENDAR_CLIENT_SECRET: "must-not-leak",
          OPENAI_API_KEY: "allowed-key",
          PATH: "/usr/bin:/bin",
        },
      ),
    ).toEqual({
      HOME: undefined,
      LANG: undefined,
      LC_ALL: undefined,
      OPENAI_API_KEY: "allowed-key",
      PATH: "/usr/bin:/bin",
      TEMP: undefined,
      TMP: undefined,
      TMPDIR: undefined,
    });
  });
});
