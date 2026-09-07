import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConfiguredTextRuntime } from "../configured-text-runtime.js";

it("persists confirmed rules relative to the config file and reopens them after restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "attention-runtime-"));
  try {
    const configPath = join(directory, "assistant.json");
    const statePath = join(directory, "state", "attention.json");
    await writeFile(
      configPath,
      JSON.stringify({
        assistant: {
          name: "Jarvis",
          timeZone: "Europe/London",
          wakePhrases: ["hey jarvis"],
        },
        intent: { provider: "deterministic" },
        features: {
          attention: {
            enabled: true,
            adapter: "file",
            timeZone: "Europe/London",
            state: { path: "state/attention.json" },
          },
        },
      }),
    );
    const options = {
      configPath,
      env: {},
      now: () => new Date("2026-09-07T12:00:00.000Z"),
    };
    const first = await createConfiguredTextRuntime(options);
    expect(
      (await first.handleText("enable health attention named Delivery health"))
        .status,
    ).toBe("needs_confirmation");
    await expect(readFile(statePath)).rejects.toMatchObject({ code: "ENOENT" });
    expect((await first.handleText("yes")).status).toBe("ok");
    expect(await readFile(statePath, "utf8")).toContain(
      "enable health attention named Delivery health",
    );
    const restarted = await createConfiguredTextRuntime(options);
    expect(
      (await restarted.handleText("show my attention rules")).text,
    ).toContain("delivery health is enabled");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
