import type { ProfileFact, ProfileStorePort } from "../ports/profile-store.js";
import { createProfilePresentationControl } from "./profile-presentation-control.js";

describe("profile presentation controls", () => {
  it("explains, corrects, and deletes only explicit profile facts", async () => {
    const now = new Date("2026-09-04T10:00:00.000Z");
    const store = createStore(now);
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
    const store = createStore(new Date(0));
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

function createStore(now: Date): ProfileStorePort {
  let facts: ProfileFact[] = [];
  return {
    clear: () => {
      const removed = facts;
      facts = [];
      return Promise.resolve(removed);
    },
    forget: (selector) => {
      const index = facts.findIndex(
        (fact) =>
          fact.field === selector.field &&
          (selector.value === undefined || fact.value === selector.value),
      );
      const removed = index < 0 ? undefined : facts.splice(index, 1)[0];
      return Promise.resolve(removed);
    },
    list: () => Promise.resolve([...facts]),
    set: (input) => {
      const timestamp = now.toISOString();
      const fact: ProfileFact = {
        createdAt: timestamp,
        ...input,
        provenance: "user-authored",
        updatedAt: timestamp,
      };
      facts = [fact, ...facts.filter((item) => item.field !== input.field)];
      return Promise.resolve(fact);
    },
  };
}
