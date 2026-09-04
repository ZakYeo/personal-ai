import { createInMemoryProfileStore } from "../adapters/local/in-memory-profile-store.js";
import { createProfilePresentationControl } from "./profile-presentation-control.js";

describe("profile presentation controls", () => {
  it("explains, corrects, and deletes only explicit profile facts", async () => {
    const now = new Date("2026-09-04T10:00:00.000Z");
    const store = createInMemoryProfileStore({ now: () => now });
    await store.set({ field: "preferredName", value: "Zak" });
    const control = createProfilePresentationControl({
      now: () => now,
      store,
    });

    await expect(
      control({
        field: "preferredName",
        requestId: "explain-1",
        type: "profile_explain",
      }),
    ).resolves.toEqual({
      status: "ok",
      text: "That detail is stored because you explicitly asked me to remember it.",
    });
    await control({
      field: "preferredName",
      requestId: "set-1",
      type: "profile_set",
      value: "Zachary",
    });
    expect(await store.list()).toMatchObject([
      { field: "preferredName", value: "Zachary" },
    ]);
    await control({
      field: "preferredName",
      requestId: "forget-1",
      type: "profile_forget",
      value: "Zachary",
    });
    expect(await store.list()).toEqual([]);
  });

  it("rejects unsupported fields without touching storage", async () => {
    const store = createInMemoryProfileStore({ now: () => new Date(0) });
    const control = createProfilePresentationControl({
      now: () => new Date(0),
      store,
    });

    await expect(
      control({
        field: "privateTarget",
        requestId: "set-1",
        type: "profile_set",
        value: "secret",
      }),
    ).resolves.toEqual({
      status: "invalid",
      text: "That profile field is not supported.",
    });
    expect(await store.list()).toEqual([]);
  });
});
