import { createInMemoryProfileStore } from "./in-memory-profile-store.js";

describe("createInMemoryProfileStore", () => {
  const now = new Date("2026-08-05T12:00:00.000Z");

  it("stores singleton facts with provenance and preserves createdAt on update", async () => {
    let current = now;
    const store = createInMemoryProfileStore({ now: () => current });

    await store.set({ field: "preferredName", value: "Zak" });
    current = new Date("2026-08-06T09:30:00.000Z");
    await store.set({ field: "preferredName", value: "Zachary" });

    await expect(store.list()).resolves.toEqual([
      {
        createdAt: "2026-08-05T12:00:00.000Z",
        field: "preferredName",
        provenance: "user-authored",
        updatedAt: "2026-08-06T09:30:00.000Z",
        value: "Zachary",
      },
    ]);
  });

  it("stores bounded interests independently and ignores duplicates", async () => {
    const store = createInMemoryProfileStore({ now: () => now });

    await store.set({ field: "interest", value: "Cycling" });
    await store.set({ field: "interest", value: "cycling" });
    await store.set({ field: "interest", value: "Photography" });

    await expect(store.list()).resolves.toMatchObject([
      { field: "interest", value: "Cycling" },
      { field: "interest", value: "Photography" },
    ]);
  });

  it("forgets one selected fact without affecting the rest", async () => {
    const store = createInMemoryProfileStore({ now: () => now });
    await store.set({ field: "preferredName", value: "Zak" });
    await store.set({ field: "interest", value: "Cycling" });

    await expect(
      store.forget({ field: "interest", value: "cycling" }),
    ).resolves.toMatchObject({ field: "interest", value: "Cycling" });
    await expect(store.list()).resolves.toMatchObject([
      { field: "preferredName", value: "Zak" },
    ]);
  });

  it("clears the complete profile", async () => {
    const store = createInMemoryProfileStore({ now: () => now });
    await store.set({ field: "preferredName", value: "Zak" });
    await store.set({ field: "interest", value: "Cycling" });

    await expect(store.clear()).resolves.toHaveLength(2);
    await expect(store.list()).resolves.toEqual([]);
  });

  it("returns clones at the store boundary", async () => {
    const store = createInMemoryProfileStore({ now: () => now });
    await store.set({ field: "preferredName", value: "Zak" });
    const facts = await store.list();
    facts[0]!.value = "Changed outside the store";

    await expect(store.list()).resolves.toMatchObject([{ value: "Zak" }]);
  });
});
