import { readFile } from "node:fs/promises";
import { join } from "node:path";

describe("Raspberry Pi systemd service", () => {
  it("runs the built Pi service with stable paths and restart policy", async () => {
    expect.hasAssertions();
    const unit = await readParsedServiceUnit();

    expectDirective(unit, "Unit", "AssertPathExists", [
      "/etc/personal-ai/config.json",
    ]);
    expectDirective(unit, "Service", "User", ["personal-ai"]);
    expectDirective(unit, "Service", "Group", ["personal-ai"]);
    expectDirective(unit, "Service", "SupplementaryGroups", ["audio"]);
    expectDirective(unit, "Service", "WorkingDirectory", ["/opt/personal-ai"]);
    expectDirective(unit, "Service", "EnvironmentFile", [
      "-/etc/personal-ai/environment",
    ]);
    expectDirective(unit, "Service", "ExecStart", [
      "/usr/bin/node /opt/personal-ai/dist/runtimes/cli/main.js pi-service --config /etc/personal-ai/config.json",
    ]);
    expectDirective(unit, "Service", "StateDirectory", ["personal-ai"]);
    expectDirective(unit, "Service", "StateDirectoryMode", ["0750"]);
    expectDirective(unit, "Service", "Restart", ["on-failure"]);
    expectDirective(unit, "Service", "RestartSec", ["5s"]);
    expectDirective(unit, "Install", "WantedBy", ["multi-user.target"]);
  });

  it("hardens the service without isolating audio devices", async () => {
    const unit = await readParsedServiceUnit();

    expectDirective(unit, "Service", "NoNewPrivileges", ["true"]);
    expectDirective(unit, "Service", "PrivateTmp", ["true"]);
    expectDirective(unit, "Service", "ProtectHome", ["true"]);
    expectDirective(unit, "Service", "ProtectSystem", ["strict"]);
    expectDirective(unit, "Service", "ReadWritePaths", [
      "/var/lib/personal-ai",
    ]);
    expectDirective(unit, "Service", "UMask", ["0027"]);
    expect(unit.Service?.PrivateDevices).toBeUndefined();
  });

  it("does not embed provider credentials", async () => {
    const unit = await readServiceUnit();

    expect(unit).not.toMatch(/OPENAI_API_KEY\s*=/u);
    expect(unit).not.toMatch(/GOOGLE_CALENDAR_(?:ACCESS|REFRESH)_TOKEN\s*=/u);
    expect(unit).not.toMatch(/Bearer\s+[A-Za-z0-9._-]+/u);

    const piConfig = await readFile(
      join(process.cwd(), "config", "pi-voice-openai.example.json"),
      "utf8",
    );
    expect(piConfig).not.toMatch(
      /desktopVoice[\s\S]*args[\s\S]*\$OPENAI_API_KEY/u,
    );
    expect(piConfig).toContain(
      "/opt/personal-ai/scripts/openai-audio-command.sh",
    );
  });

  it("documents installation, operation, validation, and rollback", async () => {
    const guide = await readFile(
      join(process.cwd(), "docs", "07-raspberry-pi-operations.md"),
      "utf8",
    );

    expect(guide).toContain("useradd --system");
    expect(guide).toContain("systemctl daemon-reload");
    expect(guide).toContain("systemctl enable --now personal-ai.service");
    expect(guide).toContain("journalctl -u personal-ai.service");
    expect(guide).toContain("systemctl restart personal-ai.service");
    expect(guide).toContain("npm run test:e2e:openai:pi");
    expect(guide).toContain("npm run smoke:pi:qemu");
    expect(guide).toMatch(/## Upgrade and rollback/u);
    expect(guide).toContain("/opt/personal-ai-releases/");
    expect(guide).toContain("readlink -f /opt/personal-ai");
    expect(guide).toContain("ln -sfn");
    expect(guide).toContain("mv -Tf");
    expect(guide).not.toContain(
      "mv /opt/personal-ai /opt/personal-ai.previous",
    );
    expect(guide).toMatch(/does not validate.*audio hardware/isu);
  });
});

function readServiceUnit(): Promise<string> {
  return readFile(
    join(process.cwd(), "deploy", "systemd", "personal-ai.service"),
    "utf8",
  );
}

type ParsedSystemdUnit = Record<string, Record<string, string[]>>;

async function readParsedServiceUnit(): Promise<ParsedSystemdUnit> {
  return parseSystemdUnit(await readServiceUnit());
}

function parseSystemdUnit(contents: string): ParsedSystemdUnit {
  const unit: ParsedSystemdUnit = {};
  let section: string | undefined;

  for (const rawLine of contents.split("\n")) {
    const line = rawLine.trim();

    if (line.length === 0 || line.startsWith("#") || line.startsWith(";")) {
      continue;
    }

    const sectionMatch = line.match(/^\[(?<section>[^\]]+)\]$/u);
    if (sectionMatch?.groups?.section) {
      section = sectionMatch.groups.section;
      unit[section] ??= {};
      continue;
    }

    const separator = line.indexOf("=");
    if (!section || separator <= 0) {
      throw new Error(`Invalid systemd unit line: ${line}`);
    }

    const key = line.slice(0, separator);
    const value = line.slice(separator + 1);
    const directives = unit[section] ?? {};
    directives[key] = [...(directives[key] ?? []), value];
    unit[section] = directives;
  }

  return unit;
}

function expectDirective(
  unit: ParsedSystemdUnit,
  section: string,
  key: string,
  expected: string[],
): void {
  expect(unit[section]?.[key]).toEqual(expected);
}
