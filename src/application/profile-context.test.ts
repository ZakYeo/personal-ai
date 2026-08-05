import type { ProfileStorePort } from "../ports/profile-store.js";
import { createProfileContextReaders } from "./profile-context.js";

const timestamp = "2026-08-05T12:00:00.000Z";

describe("createProfileContextReaders", () => {
  it("projects only preferred name and response style into global personalization", async () => {
    const list = vi.fn(() =>
      Promise.resolve([
        fact("preferredName", "Zak"),
        fact("birthDate", "1990-08-06"),
        fact("homeLocation", "London"),
        fact("interest", "Cycling"),
        fact("responseStyle", "concise"),
      ]),
    );
    const readers = createProfileContextReaders(createStore({ list }));

    const personalization =
      await readers.personalization.readAssistantPersonalization();

    expect(personalization).toEqual({
      preferredName: "Zak",
      responseStyle: "concise",
    });
    expect(Object.isFrozen(personalization)).toBe(true);
  });

  it("exposes only the explicit home location through personal context", async () => {
    const readers = createProfileContextReaders(
      createStore({
        list: () =>
          Promise.resolve([
            fact("preferredName", "Zak"),
            fact("homeLocation", "London, United Kingdom"),
          ]),
      }),
    );

    await expect(readers.personalContext.readHomeLocation()).resolves.toEqual({
      place: "London, United Kingdom",
      provenance: "user-authored",
    });
  });

  it("omits unavailable projection fields", async () => {
    const readers = createProfileContextReaders(
      createStore({ list: () => Promise.resolve([]) }),
    );

    await expect(
      readers.personalization.readAssistantPersonalization(),
    ).resolves.toEqual({});
    await expect(
      readers.personalContext.readHomeLocation(),
    ).resolves.toBeUndefined();
  });
});

function fact(
  field:
    | "birthDate"
    | "homeLocation"
    | "interest"
    | "preferredName"
    | "responseStyle",
  value: string,
) {
  return {
    createdAt: timestamp,
    field,
    provenance: "user-authored" as const,
    updatedAt: timestamp,
    value,
  };
}

function createStore(
  overrides: Pick<ProfileStorePort, "list">,
): ProfileStorePort {
  return {
    clear: () => Promise.resolve([]),
    forget: () => Promise.resolve(undefined),
    set: () => Promise.reject(new Error("not used")),
    ...overrides,
  };
}
