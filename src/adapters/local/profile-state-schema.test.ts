import { parseProfileState } from "./profile-state-schema.js";

const timestamp = "2026-08-05T12:00:00.000Z";

describe("profile state schema", () => {
  it("parses a version-one document field by field", () => {
    expect(
      parseProfileState({
        facts: [profileFact("preferredName", "Zak")],
        version: 1,
      }),
    ).toEqual({
      facts: [profileFact("preferredName", "Zak")],
      version: 1,
    });
  });

  it.each([
    ["non-object", [], "must be a JSON object"],
    ["unsupported version", { facts: [], version: 2 }, "unsupported version"],
    ["missing facts", { version: 1 }, "invalid facts collection"],
    [
      "unknown field",
      { facts: [profileFact("secret", "value")], version: 1 },
      "invalid fact state",
    ],
    [
      "extra fact property",
      {
        facts: [{ ...profileFact("preferredName", "Zak"), rawText: "private" }],
        version: 1,
      },
      "invalid fact state",
    ],
    [
      "duplicate singleton",
      {
        facts: [
          profileFact("preferredName", "Zak"),
          profileFact("preferredName", "Zachary"),
        ],
        version: 1,
      },
      "duplicate singleton facts",
    ],
    [
      "case-insensitive duplicate interest",
      {
        facts: [
          profileFact("interest", "Cycling"),
          profileFact("interest", "cycling"),
        ],
        version: 1,
      },
      "duplicate interests",
    ],
  ])("rejects $0", (_label, input, message) => {
    expect(() => parseProfileState(input)).toThrow(message);
  });

  it("rejects more than twenty interests before parsing individual facts", () => {
    expect(() =>
      parseProfileState({
        facts: Array.from({ length: 21 }, (_, index) =>
          profileFact("interest", `Interest ${index + 1}`),
        ),
        version: 1,
      }),
    ).toThrow("cannot contain more than 20 interests");
  });
});

function profileFact(field: string, value: string) {
  return {
    createdAt: timestamp,
    field,
    provenance: "user-authored",
    updatedAt: timestamp,
    value,
  };
}
