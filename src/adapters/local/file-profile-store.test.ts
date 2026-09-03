import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createDurabilityUnknownStateFileSystem } from "../../test-support/local-json-state.js";

import { AtomicFileReplacementError } from "./atomic-file-replacement.js";
import {
  createFileProfileStore,
  type ProfileStoreFileSystem,
} from "./file-profile-store.js";

const now = new Date("2026-08-05T12:00:00.000Z");

describe("createFileProfileStore", () => {
  it("reports unknown durability while leaving one profile fact process-visible", async () => {
    const store = createFileProfileStore({
      filePath: "/state/profile.json",
      fileSystem: createDurabilityUnknownStateFileSystem(),
      now: () => now,
    });

    await expect(
      store.set({ field: "preferredName", value: "Zak" }),
    ).rejects.toMatchObject({
      name: "LocalJsonStateWriteOutcomeUnknownError",
      visibleState: "intended",
    });
    await expect(store.list()).resolves.toMatchObject([
      { field: "preferredName", value: "Zak" },
    ]);
  });

  it("persists versioned profile state across instances with restrictive modes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "personal-ai-profile-"));
    const filePath = join(directory, "state", "profile.json");
    const first = createFileProfileStore({ filePath, now: () => now });

    await expect(first.list()).resolves.toEqual([]);
    const saved = await first.set({ field: "preferredName", value: "Zak" });

    const second = createFileProfileStore({ filePath, now: () => now });
    await expect(second.list()).resolves.toEqual([saved]);
    await expect(readJson(filePath)).resolves.toEqual({
      facts: [saved],
      version: 1,
    });
    expect((await stat(dirname(filePath))).mode & 0o777).toBe(0o700);
    expect((await stat(filePath)).mode & 0o777).toBe(0o600);
  });

  it.each([
    ["invalid JSON", "{not-json", "contains invalid JSON"],
    [
      "unsupported version",
      JSON.stringify({ facts: [], version: 2 }),
      "unsupported version",
    ],
    [
      "malformed fact",
      JSON.stringify({ facts: [{ field: "preferredName" }], version: 1 }),
      "invalid fact state",
    ],
  ])("rejects %s", async (_label, contents, message) => {
    const directory = await mkdtemp(join(tmpdir(), "personal-ai-profile-"));
    const filePath = join(directory, "profile.json");
    await writeFile(filePath, contents);

    await expect(
      createFileProfileStore({ filePath, now: () => now }).list(),
    ).rejects.toThrow(message);
  });

  it("serializes competing updates against the latest persisted state", async () => {
    const directory = await mkdtemp(join(tmpdir(), "personal-ai-profile-"));
    const filePath = join(directory, "profile.json");
    const store = createFileProfileStore({ filePath, now: () => now });

    await Promise.all([
      store.set({ field: "preferredName", value: "Zak" }),
      store.set({ field: "interest", value: "Cycling" }),
    ]);

    await expect(store.list()).resolves.toMatchObject([
      { field: "preferredName", value: "Zak" },
      { field: "interest", value: "Cycling" },
    ]);
  });

  it("persists forget and clear operations before returning", async () => {
    const store = createFileProfileStore({
      filePath: "/state/profile.json",
      fileSystem: createMemoryFileSystem(),
      now: () => now,
    });
    await store.set({ field: "preferredName", value: "Zak" });
    await store.set({ field: "interest", value: "Cycling" });

    await expect(
      store.forget({ field: "interest", value: "cycling" }),
    ).resolves.toMatchObject({ value: "Cycling" });
    await expect(store.clear()).resolves.toMatchObject([{ value: "Zak" }]);
    await expect(store.list()).resolves.toEqual([]);
  });

  it("does not rewrite the file when a forget selector has no match", async () => {
    const replaceFile = vi.fn<ProfileStoreFileSystem["replaceFile"]>(() =>
      Promise.resolve(),
    );
    const store = createFileProfileStore({
      filePath: "/state/profile.json",
      fileSystem: createMemoryFileSystem({ replaceFile }),
      now: () => now,
    });

    await expect(
      store.forget({ field: "preferredName" }),
    ).resolves.toBeUndefined();
    expect(replaceFile).not.toHaveBeenCalled();
  });

  it("preserves atomic cleanup diagnostics behind a safe persistence error", async () => {
    const cleanupFailure = new Error("private cleanup detail");
    const atomicFailure = new AtomicFileReplacementError(
      new Error("private primary detail"),
      [cleanupFailure],
      "not_applied",
    );
    const store = createFileProfileStore({
      filePath: "/state/profile.json",
      fileSystem: createMemoryFileSystem({
        replaceFile: () => Promise.reject(atomicFailure),
      }),
      now: () => now,
    });

    const error = await store
      .set({ field: "preferredName", value: "Zak" })
      .catch((cause: unknown) => cause);

    expect(error).toMatchObject({
      cause: atomicFailure,
      message: "Could not persist profile state.",
    });
    expect((error as Error).message).not.toContain("private");
    expect(atomicFailure.cleanupCauses).toEqual([cleanupFailure]);
  });
});

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, "utf8")) as unknown;
}

function createMemoryFileSystem(
  overrides: Partial<ProfileStoreFileSystem> = {},
): ProfileStoreFileSystem {
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
      await overrides.replaceFile?.(options);
      contents = options.contents;
    },
  };
}
