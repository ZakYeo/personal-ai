import type { ProfileFact, ProfileStorePort } from "../ports/profile-store.js";
import { createProfilePresentationControl } from "./profile-presentation-control.js";

describe("profile presentation controls", () => {
  it("rejects a stale selection after the canonical fact changes", async () => {
    const now = new Date("2026-09-04T10:00:00Z");
    const store = createStore(now);
    await store.set({ field: "homeTimeZone", value: "Europe/London" });
    const session = createProfilePresentationControl({
      referencePrefix: "test",
      now: () => now,
      store,
    });
    const reference =
      session.project(await store.list())[0]?.reference ?? "missing";
    await store.set({ field: "homeTimeZone", value: "Europe/Paris" });
    await expect(
      session.handle({
        field: "homeTimeZone",
        reference,
        requestId: "stale",
        type: "profile_forget",
      }),
    ).resolves.toMatchObject({ status: "invalid" });
    expect((await store.list())[0]?.value).toBe("Europe/Paris");
  });
  it("uses exact selected timezone facts after display humanization", async () => {
    const now = new Date("2026-09-04T10:00:00Z");
    const store = createStore(now);
    await store.set({ field: "homeTimeZone", value: "Europe/London" });
    const session = createProfilePresentationControl({
      referencePrefix: "test",
      now: () => now,
      store,
    });
    const [fact] = session.project(await store.list());
    expect(fact?.value).toBe("London time");
    if (!fact) throw new Error("Missing profile projection");
    await session.handle({
      field: fact.field,
      reference: fact.reference,
      requestId: "unchanged",
      type: "profile_set",
      value: fact.value,
    });
    expect((await store.list())[0]?.value).toBe("Europe/London");
    await session.handle({
      field: fact.field,
      reference: fact.reference,
      requestId: "delete",
      type: "profile_forget",
    });
    expect(await store.list()).toEqual([]);
  });
  it("explains, corrects, and deletes only explicit profile facts", async () => {
    const now = new Date("2026-09-04T10:00:00.000Z");
    const store = createStore(now);
    await store.set({ field: "preferredName", value: "Zak" });
    const control = createProfilePresentationControl({
      referencePrefix: "test",
      now: () => now,
      store,
    });

    await expect(
      control.handle({
        field: "preferredName",
        requestId: "explain-1",
        type: "profile_explain",
      }),
    ).resolves.toEqual({
      status: "ok",
      text: "That detail is stored because you explicitly asked me to remember it.",
    });
    const original = control.project(await store.list())[0];
    await control.handle({
      field: "preferredName",
      reference: original?.reference ?? "missing",
      requestId: "set-1",
      type: "profile_set",
      value: "Zachary",
    });
    expect(await store.list()).toMatchObject([
      { field: "preferredName", value: "Zachary" },
    ]);
    const updated = control.project(await store.list())[0];
    await control.handle({
      field: "preferredName",
      reference: updated?.reference ?? "missing",
      requestId: "forget-1",
      type: "profile_forget",
    });
    expect(await store.list()).toEqual([]);
  });

  it("rejects unsupported fields without touching storage", async () => {
    const store = createStore(new Date(0));
    const control = createProfilePresentationControl({
      referencePrefix: "test",
      now: () => new Date(0),
      store,
    });

    await expect(
      control.handle({
        field: "privateTarget",
        reference: "missing",
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
