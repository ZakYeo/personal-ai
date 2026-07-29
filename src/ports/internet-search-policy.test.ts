import { validateInternetSearchCitationIntegrity } from "./internet-search-policy.js";

describe("internet search citation integrity", () => {
  it.each([
    {
      citations: [{ endIndex: 4, sourceId: "one", startIndex: 0 }],
      label: "out-of-bounds indexes",
      sourceIds: ["one"],
      textLength: 3,
    },
    {
      citations: [
        { endIndex: 7, sourceId: "two", startIndex: 4 },
        { endIndex: 3, sourceId: "one", startIndex: 0 },
      ],
      label: "unordered ranges",
      sourceIds: ["one", "two"],
      textLength: 7,
    },
    {
      citations: [
        { endIndex: 5, sourceId: "one", startIndex: 0 },
        { endIndex: 7, sourceId: "two", startIndex: 4 },
      ],
      label: "overlapping ranges",
      sourceIds: ["one", "two"],
      textLength: 7,
    },
    {
      citations: [{ endIndex: 3, sourceId: "missing", startIndex: 0 }],
      label: "unresolved sources",
      sourceIds: ["one"],
      textLength: 3,
    },
    {
      citations: [{ endIndex: 3, sourceId: "one", startIndex: 0 }],
      label: "uncited sources",
      sourceIds: ["one", "two"],
      textLength: 3,
    },
    {
      citations: [],
      label: "duplicate source IDs",
      sourceIds: ["one", "one"],
      textLength: 0,
    },
  ])("rejects $label", ({ citations, sourceIds, textLength }) => {
    expect(() =>
      validateInternetSearchCitationIntegrity({
        citations,
        sourceIds,
        textLength,
      }),
    ).toThrow("Internet search citation integrity validation failed.");
  });

  it("accepts ordered adjacent citations with complete source coverage", () => {
    expect(() =>
      validateInternetSearchCitationIntegrity({
        citations: [
          { endIndex: 3, sourceId: "one", startIndex: 0 },
          { endIndex: 7, sourceId: "two", startIndex: 4 },
          { endIndex: 10, sourceId: "one", startIndex: 7 },
        ],
        sourceIds: ["one", "two"],
        textLength: 10,
      }),
    ).not.toThrow();
  });

  it("accepts an empty no-result response", () => {
    expect(() =>
      validateInternetSearchCitationIntegrity({
        citations: [],
        sourceIds: [],
        textLength: 0,
      }),
    ).not.toThrow();
  });
});
