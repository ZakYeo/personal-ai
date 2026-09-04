import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFileBriefingStore } from "./file-briefing-store.js";

describe("createFileBriefingStore", () => {
  it("persists preferences and the last safe snapshot across instances", async () => {
    const directory = await mkdtemp(join(tmpdir(), "personal-ai-briefing-"));
    const filePath = join(directory, "state", "briefings.json");
    const now = () => new Date("2026-09-04T07:00:00.000Z");
    const first = createFileBriefingStore({
      filePath,
      now,
      timeZone: "Europe/London",
    });
    const current = await first.getPreferences();
    await first.updatePreferences({
      expectedRevision: current.revision,
      preferences: { ...current, length: "short", searchTopics: [] },
      updatedAt: now().toISOString(),
    });
    await first.saveSnapshot({
      createdAt: now().toISOString(),
      sections: [
        {
          available: true,
          items: [{ key: "task:one", text: "One task is due." }],
          section: "tasks",
        },
      ],
      timeZone: "Europe/London",
    });

    const second = createFileBriefingStore({
      filePath,
      now,
      timeZone: "Europe/London",
    });
    await expect(second.getPreferences()).resolves.toMatchObject({
      length: "short",
      revision: 2,
    });
    await expect(second.getLastSnapshot()).resolves.toMatchObject({
      sections: [{ section: "tasks" }],
    });
    await expect(readFile(filePath, "utf8")).resolves.toContain('"version":1');
  });
});
