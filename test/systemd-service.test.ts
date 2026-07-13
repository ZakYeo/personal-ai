import { readFile } from "node:fs/promises";
import { join } from "node:path";

describe("Raspberry Pi systemd service", () => {
  it("runs the built Pi service with stable paths and restart policy", async () => {
    const unit = await readServiceUnit();

    expect(unit).toContain("User=personal-ai");
    expect(unit).toContain("Group=personal-ai");
    expect(unit).toContain("SupplementaryGroups=audio");
    expect(unit).toContain("WorkingDirectory=/opt/personal-ai");
    expect(unit).toContain("EnvironmentFile=-/etc/personal-ai/environment");
    expect(unit).toContain(
      "ExecStart=/usr/bin/node /opt/personal-ai/dist/runtimes/cli/main.js pi-service --config /etc/personal-ai/config.json",
    );
    expect(unit).toContain("StateDirectory=personal-ai");
    expect(unit).toContain("StateDirectoryMode=0750");
    expect(unit).toContain("Restart=on-failure");
    expect(unit).toContain("RestartSec=5s");
    expect(unit).toContain("WantedBy=multi-user.target");
  });

  it("hardens the service without isolating audio devices", async () => {
    const unit = await readServiceUnit();

    expect(unit).toContain("NoNewPrivileges=true");
    expect(unit).toContain("PrivateTmp=true");
    expect(unit).toContain("ProtectHome=true");
    expect(unit).toContain("ProtectSystem=strict");
    expect(unit).toContain("ReadWritePaths=/var/lib/personal-ai");
    expect(unit).toContain("UMask=0027");
    expect(unit).not.toContain("PrivateDevices=true");
  });

  it("does not embed provider credentials", async () => {
    const unit = await readServiceUnit();

    expect(unit).not.toMatch(/OPENAI_API_KEY\s*=/u);
    expect(unit).not.toMatch(/GOOGLE_CALENDAR_(?:ACCESS|REFRESH)_TOKEN\s*=/u);
    expect(unit).not.toMatch(/Bearer\s+[A-Za-z0-9._-]+/u);
  });
});

function readServiceUnit(): Promise<string> {
  return readFile(
    join(process.cwd(), "deploy", "systemd", "personal-ai.service"),
    "utf8",
  );
}
