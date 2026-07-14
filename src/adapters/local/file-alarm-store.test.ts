import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
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
      now: () => new Date("2026-07-13T16:00:00.000Z"),
    });

    await expect(first.list()).resolves.toEqual([]);
    await expect(
      first.add({
        label: "tea",
        scheduledFor: "2026-07-13T17:00:00.000Z",
      }),
    ).resolves.toEqual({
      createdAt: "2026-07-13T16:00:00.000Z",
      deliveryAttempts: 0,
      id: "alarm-persisted",
      label: "tea",
      nextDeliveryAt: "2026-07-13T17:00:00.000Z",
      revision: 1,
      successfulDeliveries: 0,
      scheduledFor: "2026-07-13T17:00:00.000Z",
      status: "scheduled",
      updatedAt: "2026-07-13T16:00:00.000Z",
    });

    const second = createFileAlarmStore({ filePath });

    await expect(second.list()).resolves.toEqual([
      {
        createdAt: "2026-07-13T16:00:00.000Z",
        deliveryAttempts: 0,
        id: "alarm-persisted",
        label: "tea",
        nextDeliveryAt: "2026-07-13T17:00:00.000Z",
        revision: 1,
        successfulDeliveries: 0,
        scheduledFor: "2026-07-13T17:00:00.000Z",
        status: "scheduled",
        updatedAt: "2026-07-13T16:00:00.000Z",
      },
    ]);
    await expect(readJson(filePath)).resolves.toEqual({
      alarms: [
        {
          createdAt: "2026-07-13T16:00:00.000Z",
          deliveryAttempts: 0,
          id: "alarm-persisted",
          label: "tea",
          nextDeliveryAt: "2026-07-13T17:00:00.000Z",
          revision: 1,
          successfulDeliveries: 0,
          scheduledFor: "2026-07-13T17:00:00.000Z",
          status: "scheduled",
          updatedAt: "2026-07-13T16:00:00.000Z",
        },
      ],
      version: 2,
    });
  });

  it("migrates version-one records deterministically on the next write", async () => {
    const directory = await mkdtemp(join(tmpdir(), "personal-ai-alarms-"));
    const filePath = join(directory, "alarms.json");
    await writeFile(
      filePath,
      JSON.stringify({
        alarms: [
          {
            id: "legacy-alarm",
            label: "legacy tea",
            scheduledFor: "2026-07-13T17:00:00.000Z",
          },
        ],
        version: 1,
      }),
    );
    const store = createFileAlarmStore({
      createId: () => "new-alarm",
      filePath,
      now: () => new Date("2026-07-13T16:30:00.000Z"),
    });

    await expect(store.list()).resolves.toEqual([
      {
        createdAt: "2026-07-13T17:00:00.000Z",
        deliveryAttempts: 0,
        id: "legacy-alarm",
        label: "legacy tea",
        nextDeliveryAt: "2026-07-13T17:00:00.000Z",
        revision: 1,
        scheduledFor: "2026-07-13T17:00:00.000Z",
        status: "scheduled",
        successfulDeliveries: 0,
        updatedAt: "2026-07-13T17:00:00.000Z",
      },
    ]);

    await store.add({
      label: "new tea",
      scheduledFor: "2026-07-13T18:00:00.000Z",
    });

    await expect(readJson(filePath)).resolves.toMatchObject({
      version: 2,
      alarms: [
        { id: "legacy-alarm", status: "scheduled" },
        { id: "new-alarm", status: "scheduled" },
      ],
    });
  });

  it("creates private state directories and files", async () => {
    const directory = await mkdtemp(join(tmpdir(), "personal-ai-alarms-"));
    const stateDirectory = join(directory, "private-state");
    const filePath = join(stateDirectory, "alarms.json");
    const store = createFileAlarmStore({
      createId: () => "alarm-private",
      filePath,
    });

    await store.add({
      label: "private appointment",
      scheduledFor: "2026-07-13T17:00:00.000Z",
    });

    expect((await stat(stateDirectory)).mode & 0o777).toBe(0o700);
    expect((await stat(filePath)).mode & 0o777).toBe(0o600);
  });

  it.each([
    { alarms: [], version: 3 },
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
    {
      alarms: [persistedAlarm({ revision: undefined })],
      version: 2,
    },
    {
      alarms: [persistedAlarm({ nextDeliveryAt: undefined })],
      version: 2,
    },
    {
      alarms: [persistedAlarm({ status: "completed" })],
      version: 2,
    },
    {
      alarms: [persistedAlarm({ deliveryAttempts: 0, status: "ringing" })],
      version: 2,
    },
    {
      alarms: [
        persistedAlarm({
          deliveryAttempts: 0,
          nextDeliveryAt: undefined,
          status: "dismissed",
        }),
      ],
      version: 2,
    },
    {
      alarms: [
        persistedAlarm({
          deliveryAttempts: 1,
          nextDeliveryAt: undefined,
          status: "cancelled",
        }),
      ],
      version: 2,
    },
    {
      alarms: [
        persistedAlarm({
          nextDeliveryAt: undefined,
          status: "missed",
          successfulDeliveries: 1,
        }),
      ],
      version: 2,
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

  it("persists revision-checked lifecycle updates across instances", async () => {
    const directory = await mkdtemp(join(tmpdir(), "personal-ai-alarms-"));
    const filePath = join(directory, "alarms.json");
    const store = createFileAlarmStore({
      createId: () => "alarm-lifecycle",
      filePath,
      now: () => new Date("2026-07-13T16:00:00.000Z"),
    });
    const alarm = await store.add({
      label: "tea",
      scheduledFor: "2026-07-13T17:00:00.000Z",
    });

    await expect(
      store.update({
        changes: {
          deliveryAttempts: 1,
          nextDeliveryAt: "2026-07-13T17:01:00.000Z",
          status: "ringing",
        },
        expectedRevision: alarm.revision,
        id: alarm.id,
        updatedAt: "2026-07-13T17:00:00.000Z",
      }),
    ).resolves.toMatchObject({ revision: 2, status: "ringing" });

    await expect(createFileAlarmStore({ filePath }).list()).resolves.toEqual([
      expect.objectContaining({
        deliveryAttempts: 1,
        nextDeliveryAt: "2026-07-13T17:01:00.000Z",
        revision: 2,
        status: "ringing",
      }),
    ]);
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
    expect(replacements[0]?.contents).toContain('"version":2');
    expect(replacements[0]?.targetPath).toBe("/state/alarms.json");
    expect(replacements[0]?.temporaryPath).toMatch(
      /^\/state\/\.alarms\.json\..+\.tmp$/u,
    );
  });
});

function persistedAlarm(overrides: Record<string, unknown> = {}) {
  return {
    createdAt: "2026-07-13T16:00:00.000Z",
    deliveryAttempts: 0,
    id: "alarm-v2",
    label: "tea",
    nextDeliveryAt: "2026-07-13T17:00:00.000Z",
    revision: 1,
    scheduledFor: "2026-07-13T17:00:00.000Z",
    status: "scheduled",
    successfulDeliveries: 0,
    updatedAt: "2026-07-13T16:00:00.000Z",
    ...overrides,
  };
}

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, "utf8")) as unknown;
}
