import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createFileAlarmStore,
  type AlarmStoreFileSystem,
} from "./file-alarm-store.js";

describe("createFileAlarmStore", () => {
  it("starts empty when the state file is missing and persists across instances", async () => {
    const directory = await mkdtemp(join(tmpdir(), "personal-ai-alarms-"));
    const filePath = join(directory, "state", "alarms.json");
    const first = createFileAlarmStore({
      createId: () => "alarm-persisted",
      filePath,
    });

    await expect(first.list()).resolves.toEqual([]);
    await expect(
      first.add({
        label: "tea",
        scheduledFor: "2026-07-13T17:00:00.000Z",
      }),
    ).resolves.toEqual({
      id: "alarm-persisted",
      label: "tea",
      scheduledFor: "2026-07-13T17:00:00.000Z",
    });

    const second = createFileAlarmStore({ filePath });

    await expect(second.list()).resolves.toEqual([
      {
        id: "alarm-persisted",
        label: "tea",
        scheduledFor: "2026-07-13T17:00:00.000Z",
      },
    ]);
    await expect(readJson(filePath)).resolves.toEqual({
      alarms: [
        {
          id: "alarm-persisted",
          label: "tea",
          scheduledFor: "2026-07-13T17:00:00.000Z",
        },
      ],
      version: 1,
    });
  });

  it.each([
    { alarms: [], version: 2 },
    { alarms: "invalid", version: 1 },
    {
      alarms: [
        {
          id: "alarm-1",
          label: "tea",
          scheduledFor: "not-a-timestamp",
        },
      ],
      version: 1,
    },
    {
      alarms: [
        {
          id: "alarm-1",
          label: "tea",
          scheduledFor: "2026-07-13T17:00:00.000Z",
        },
        {
          id: "alarm-1",
          label: "coffee",
          scheduledFor: "2026-07-13T18:00:00.000Z",
        },
      ],
      version: 1,
    },
  ])("rejects invalid persisted state %#", async (state) => {
    const directory = await mkdtemp(join(tmpdir(), "personal-ai-alarms-"));
    const filePath = join(directory, "alarms.json");
    await writeFile(filePath, JSON.stringify(state));

    await expect(createFileAlarmStore({ filePath }).list()).rejects.toThrow(
      "Alarm state file is invalid.",
    );
  });

  it("preserves malformed JSON as an internal cause", async () => {
    const directory = await mkdtemp(join(tmpdir(), "personal-ai-alarms-"));
    const filePath = join(directory, "alarms.json");
    await writeFile(filePath, "not json");

    const error = await createFileAlarmStore({ filePath })
      .list()
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(Error);
    if (!(error instanceof Error)) {
      throw new TypeError("Expected alarm state failure.");
    }
    expect(error.message).toBe("Alarm state file contains invalid JSON.");
    expect(error.cause).toBeInstanceOf(SyntaxError);
  });

  it("serializes concurrent additions without losing records", async () => {
    const directory = await mkdtemp(join(tmpdir(), "personal-ai-alarms-"));
    const filePath = join(directory, "alarms.json");
    let nextId = 0;
    const store = createFileAlarmStore({
      createId: () => `alarm-${++nextId}`,
      filePath,
    });

    await Promise.all([
      store.add({
        label: "first",
        scheduledFor: "2026-07-13T17:00:00.000Z",
      }),
      store.add({
        label: "second",
        scheduledFor: "2026-07-13T18:00:00.000Z",
      }),
    ]);

    await expect(store.list()).resolves.toHaveLength(2);
  });

  it("writes through a same-directory atomic replacement and preserves its failure", async () => {
    const replacements: Array<{
      contents: string;
      targetPath: string;
      temporaryPath: string;
    }> = [];
    const fileSystem: AlarmStoreFileSystem = {
      mkdir: () => Promise.resolve(undefined),
      readFile: () =>
        Promise.reject(Object.assign(new Error("missing"), { code: "ENOENT" })),
      replaceFile: (options) => {
        replacements.push(options);
        return Promise.reject(new Error("replacement failed"));
      },
    };
    const store = createFileAlarmStore({
      createId: () => "alarm-1",
      filePath: "/state/alarms.json",
      fileSystem,
    });

    const error = await store
      .add({
        label: "tea",
        scheduledFor: "2026-07-13T17:00:00.000Z",
      })
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(Error);
    if (!(error instanceof Error)) {
      throw new TypeError("Expected alarm persistence failure.");
    }
    expect(error.message).toBe("Could not persist alarm state.");
    expect(error.cause).toMatchObject({ message: "replacement failed" });
    expect(replacements).toHaveLength(1);
    expect(replacements[0]?.contents).toContain('"version":1');
    expect(replacements[0]?.targetPath).toBe("/state/alarms.json");
    expect(replacements[0]?.temporaryPath).toMatch(
      /^\/state\/\.alarms\.json\..+\.tmp$/u,
    );
  });
});

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, "utf8")) as unknown;
}
