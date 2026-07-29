import {
  type InternetSearchCitationIntegrityFailure,
  validateInternetSearchCitationIntegrity,
} from "./internet-search-policy.js";

describe("internet search citation integrity", () => {
  it.each([
    {
      citations: [{ endIndex: 3, sourceId: "one", startIndex: 0.5 }],
      expectedFailure: "bounds",
      label: "non-integer indexes",
      sourceIds: ["one"],
      textLength: 3,
    },
    {
      citations: [
        { endIndex: 7, sourceId: "two", startIndex: 4 },
        { endIndex: 3, sourceId: "one", startIndex: 0 },
      ],
      expectedFailure: "ordering",
      label: "unordered ranges",
      sourceIds: ["one", "two"],
      textLength: 7,
    },
    {
      citations: [
        { endIndex: 5, sourceId: "one", startIndex: 0 },
        { endIndex: 7, sourceId: "two", startIndex: 4 },
      ],
      expectedFailure: "overlap",
      label: "overlapping ranges",
      sourceIds: ["one", "two"],
      textLength: 7,
    },
    {
      citations: [{ endIndex: 3, sourceId: "missing", startIndex: 0 }],
      expectedFailure: "source_resolution",
      label: "unresolved sources",
      sourceIds: ["one"],
      textLength: 3,
    },
    {
      citations: [{ endIndex: 3, sourceId: "one", startIndex: 0 }],
      expectedFailure: "source_coverage",
      label: "uncited sources",
      sourceIds: ["one", "two"],
      textLength: 3,
    },
    {
      citations: [],
      expectedFailure: "duplicate_source",
      label: "duplicate source IDs",
      sourceIds: ["one", "one"],
      textLength: 0,
    },
  ])(
    "classifies $label",
    ({ citations, expectedFailure, sourceIds, textLength }) => {
      const createError = vi.fn(
        (failure: InternetSearchCitationIntegrityFailure) =>
          new Error(`citation integrity: ${failure}`),
      );

      expect(() =>
        validateInternetSearchCitationIntegrity({
          citations,
          createError,
          sourceIds,
          textLength,
        }),
      ).toThrow(`citation integrity: ${expectedFailure}`);
      expect(createError).toHaveBeenCalledExactlyOnceWith(expectedFailure);
    },
  );

  it("uses a canonical default error when no factory is supplied", () => {
    expect(() =>
      validateInternetSearchCitationIntegrity({
        citations: [{ endIndex: 4, sourceId: "one", startIndex: 0 }],
        sourceIds: ["one"],
        textLength: 3,
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
