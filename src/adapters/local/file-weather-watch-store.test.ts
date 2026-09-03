import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createDurabilityUnknownStateFileSystem } from "../../test-support/local-json-state.js";

import {
  createActiveWeatherWatch,
  createNewWeatherWatch,
  weatherWatchNow,
} from "../../test-support/weather-watch-store.js";
import { AtomicFileReplacementError } from "./atomic-file-replacement.js";
import {
  createFileWeatherWatchStore,
  type WeatherWatchStoreFileSystem,
} from "./file-weather-watch-store.js";

describe("createFileWeatherWatchStore", () => {
  it("returns a created watch after reconciling a durability-unknown replacement", async () => {
    const createId = vi.fn(() => "weather-watch-reconciled");
    const store = createFileWeatherWatchStore({
      createId,
      filePath: "/state/weather-watches.json",
      fileSystem: createDurabilityUnknownStateFileSystem(),
      now: () => weatherWatchNow,
    });

    await expect(store.add(createNewWeatherWatch())).resolves.toMatchObject({
      id: "weather-watch-reconciled",
    });
    await expect(store.list()).resolves.toHaveLength(1);
    expect(createId).toHaveBeenCalledTimes(1);
  });

  it("persists versioned state across instances with restrictive modes", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "personal-ai-weather-watches-"),
    );
    const filePath = join(directory, "state", "weather-watches.json");
    const first = createFileWeatherWatchStore({
      createId: () => "weather-watch-persisted",
      filePath,
      now: () => weatherWatchNow,
    });

    await expect(first.list()).resolves.toEqual([]);
    const added = await first.add(createNewWeatherWatch());

    const second = createFileWeatherWatchStore({
      filePath,
      now: () => weatherWatchNow,
    });
    await expect(second.list()).resolves.toEqual([added]);
    await expect(readJson(filePath)).resolves.toEqual({
      version: 1,
      watches: [added],
    });
    expect((await stat(dirname(filePath))).mode & 0o777).toBe(0o700);
    expect((await stat(filePath)).mode & 0o777).toBe(0o600);
  });

  it.each([
    ["invalid JSON", "{not-json", "contains invalid JSON"],
    [
      "unsupported version",
      JSON.stringify({ version: 2, watches: [] }),
      "has an unsupported version",
    ],
    [
      "malformed nested state",
      JSON.stringify({
        version: 1,
        watches: [
          {
            condition: {
              metric: "precipitation",
              operator: "atLeast",
              threshold: "rain",
              unit: "mm",
            },
          },
        ],
      }),
      "contains invalid watch state",
    ],
  ])("rejects %s", async (_label, contents, message) => {
    const directory = await mkdtemp(
      join(tmpdir(), "personal-ai-weather-watches-"),
    );
    const filePath = join(directory, "weather-watches.json");
    await writeFile(filePath, contents);
    const store = createFileWeatherWatchStore({
      filePath,
      now: () => weatherWatchNow,
    });

    await expect(store.list()).rejects.toThrow(message);
  });

  it("rejects duplicate persisted IDs before an update can target either record", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "personal-ai-weather-watches-"),
    );
    const filePath = join(directory, "weather-watches.json");
    const duplicate = createActiveWeatherWatch();
    await writeFile(
      filePath,
      JSON.stringify({ version: 1, watches: [duplicate, duplicate] }),
    );
    const store = createFileWeatherWatchStore({
      filePath,
      now: () => weatherWatchNow,
    });

    await expect(store.list()).rejects.toThrow(
      "contains duplicate weather watch IDs",
    );
  });

  it("rejects an over-capacity add without replacing readable prior state", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "personal-ai-weather-watches-"),
    );
    const filePath = join(directory, "weather-watches.json");
    const watches = Array.from({ length: 1_000 }, (_, index) =>
      createTerminalWeatherWatch(`weather-watch-${index + 1}`),
    );
    const original = { version: 1, watches };
    await writeFile(filePath, JSON.stringify(original));
    const store = createFileWeatherWatchStore({
      createId: () => "weather-watch-1001",
      filePath,
      now: () => weatherWatchNow,
    });

    await expect(store.add(createNewWeatherWatch())).rejects.toThrow(
      "cannot contain more than 1000 watches",
    );
    await expect(readJson(filePath)).resolves.toEqual(original);
    await expect(store.list()).resolves.toHaveLength(1_000);
  });

  it("rejects a twenty-fifth active watch before replacing persisted state", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "personal-ai-weather-watches-"),
    );
    const filePath = join(directory, "weather-watches.json");
    const watches = Array.from({ length: 24 }, (_, index) =>
      createActiveWeatherWatch({ id: `weather-watch-${index + 1}` }),
    );
    const original = { version: 1, watches };
    await writeFile(filePath, JSON.stringify(original));
    const store = createFileWeatherWatchStore({
      createId: () => "weather-watch-25",
      filePath,
      now: () => weatherWatchNow,
    });

    await expect(store.add(createNewWeatherWatch())).rejects.toThrow(
      "cannot contain more than 24 active watches",
    );
    await expect(readJson(filePath)).resolves.toEqual(original);
  });

  it("serializes competing revision updates against the latest persisted state", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "personal-ai-weather-watches-"),
    );
    const filePath = join(directory, "weather-watches.json");
    const store = createFileWeatherWatchStore({
      createId: () => "weather-watch-1",
      filePath,
      now: () => weatherWatchNow,
    });
    const watch = await store.add(createNewWeatherWatch());

    const [cancelled, claimed] = await Promise.all([
      store.cancel({
        cancelledAt: "2026-07-28T12:01:00.000Z",
        expectedRevision: watch.revision,
        id: watch.id,
      }),
      store.claimNotification({
        claimedAt: "2026-07-28T12:01:00.000Z",
        expectedRevision: watch.revision,
        id: watch.id,
        window: {
          endAt: "2026-07-29T10:00:00.000Z",
          startAt: "2026-07-29T09:00:00.000Z",
        },
      }),
    ]);

    expect(cancelled).toMatchObject({ revision: 2, status: "cancelled" });
    expect(claimed).toBeUndefined();
    await expect(store.list()).resolves.toEqual([cancelled]);
  });

  it("persists a claim before resolving it to the caller", async () => {
    const documents: string[] = [];
    let persisted: boolean;
    const fileSystem = createMemoryFileSystem({
      replaceFile: ({ contents }) => {
        documents.push(contents);
        persisted = true;
        return Promise.resolve();
      },
    });
    const store = createFileWeatherWatchStore({
      createId: () => "weather-watch-1",
      filePath: "/state/weather-watches.json",
      fileSystem,
      now: () => weatherWatchNow,
    });
    const watch = await store.add(createNewWeatherWatch());
    persisted = false;

    const claimed = await store.claimNotification({
      claimedAt: "2026-07-28T12:01:00.000Z",
      expectedRevision: watch.revision,
      id: watch.id,
      window: {
        endAt: "2026-07-29T10:00:00.000Z",
        startAt: "2026-07-29T09:00:00.000Z",
      },
    });

    expect(persisted).toBe(true);
    expect(claimed).toMatchObject({ status: "triggered" });
    expect(JSON.parse(documents.at(-1)!) as unknown).toMatchObject({
      watches: [
        {
          id: "weather-watch-1",
          notification: {
            claimedAt: "2026-07-28T12:01:00.000Z",
          },
          status: "triggered",
        },
      ],
    });
  });

  it("preserves atomic cleanup diagnostics behind its safe persistence error", async () => {
    const cleanupFailure = new Error("private cleanup detail");
    const atomicFailure = new AtomicFileReplacementError(
      new Error("private primary detail"),
      [cleanupFailure],
      "not_applied",
    );
    const store = createFileWeatherWatchStore({
      createId: () => "weather-watch-1",
      filePath: "/state/weather-watches.json",
      fileSystem: createMemoryFileSystem({
        replaceFile: () => Promise.reject(atomicFailure),
      }),
      now: () => weatherWatchNow,
    });

    const error = await store
      .add(createNewWeatherWatch())
      .catch((cause: unknown) => cause);

    expect(error).toMatchObject({
      cause: atomicFailure,
      message: "Could not persist weather watch state.",
    });
    expect((error as Error).message).not.toContain("private");
    expect(atomicFailure.cleanupCauses).toEqual([cleanupFailure]);
  });
});

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, "utf8")) as unknown;
}

function createMemoryFileSystem(
  overrides: Partial<WeatherWatchStoreFileSystem> = {},
): WeatherWatchStoreFileSystem {
  let contents: string | undefined;
  return {
    ...overrides,
    mkdir: () => Promise.resolve(),
    readFile: () =>
      contents === undefined
        ? Promise.reject(
            Object.assign(new Error("missing"), { code: "ENOENT" }),
          )
        : Promise.resolve(contents),
    replaceFile: async (options) => {
      contents = options.contents;
      await overrides.replaceFile?.(options);
    },
  };
}

function createTerminalWeatherWatch(id: string) {
  const terminalAt = "2026-07-28T12:01:00.000Z";
  return createActiveWeatherWatch({
    id,
    revision: 2,
    status: "cancelled",
    terminalAt,
    updatedAt: terminalAt,
  });
}
