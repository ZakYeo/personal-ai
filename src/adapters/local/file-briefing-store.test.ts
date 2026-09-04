import { mkdtemp, readFile, stat } from "node:fs/promises";
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
    expect((await stat(filePath)).mode & 0o777).toBe(0o600);
    expect((await stat(join(directory, "state"))).mode & 0o777).toBe(0o700);
  });

  it("serializes concurrent claims and enforces revision checks", async () => {
    const directory = await mkdtemp(join(tmpdir(), "personal-ai-briefing-"));
    const filePath = join(directory, "briefings.json");
    const now = () => new Date("2026-09-04T07:00:00.000Z");
    const store = createFileBriefingStore({
      filePath,
      now,
      timeZone: "Europe/London",
    });

    await expect(
      Promise.all([
        store.claimDeliverySlot({ claimedAt: now().toISOString(), id: "same" }),
        store.claimDeliverySlot({ claimedAt: now().toISOString(), id: "same" }),
      ]),
    ).resolves.toEqual([true, false]);
    const current = await store.getPreferences();
    await expect(
      store.updatePreferences({
        expectedRevision: current.revision + 1,
        preferences: current,
        updatedAt: now().toISOString(),
      }),
    ).resolves.toBeUndefined();
    await expect(
      store.updatePreferences({
        expectedRevision: current.revision,
        preferences: { ...current, searchTopics: ["AI", "ai"] },
        updatedAt: now().toISOString(),
      }),
    ).rejects.toThrow("invalid state");
  });

  it("clones nested preferences and snapshots at its boundaries", async () => {
    const directory = await mkdtemp(join(tmpdir(), "personal-ai-briefing-"));
    const now = () => new Date("2026-09-04T07:00:00.000Z");
    const store = createFileBriefingStore({
      filePath: join(directory, "briefings.json"),
      now,
      timeZone: "Europe/London",
    });
    const preferences = await store.getPreferences();
    (preferences.sections as string[]).push("internet");
    const snapshot = {
      createdAt: now().toISOString(),
      sections: [
        {
          available: true,
          items: [{ key: "task:one", text: "One task is due." }],
          section: "tasks" as const,
        },
      ],
      timeZone: "Europe/London",
    };
    await store.saveSnapshot(snapshot);
    snapshot.sections[0]!.items[0]!.text = "mutated";

    await expect(store.getPreferences()).resolves.not.toMatchObject({
      sections: expect.arrayContaining(["internet"]) as unknown,
    });
    await expect(store.getLastSnapshot()).resolves.toMatchObject({
      sections: [{ items: [{ text: "One task is due." }] }],
    });
  });
});
