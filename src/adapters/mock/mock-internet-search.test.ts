import { createMockInternetSearch } from "./mock-internet-search.js";
import { deterministicTestNow } from "../../test-support/primitives.js";

describe("createMockInternetSearch", () => {
  it("returns bounded deterministic source results", async () => {
    const search = createMockInternetSearch();

    await expect(
      search.search(
        { maxResults: 1, query: "TypeScript 5.7" },
        { now: deterministicTestNow },
      ),
    ).resolves.toEqual({
      answer:
        "TypeScript 5.7 adds checks for variables that have never been initialized. [1]",
      citations: [
        {
          endIndex: 78,
          sourceId: "typescript-5-7",
          startIndex: 75,
        },
      ],
      sources: [
        {
          extract:
            "TypeScript 5.7 adds checks for variables that have never been initialized.",
          id: "typescript-5-7",
          publishedAt: "2024-11-22T00:00:00.000Z",
          title: "Announcing TypeScript 5.7",
          url: "https://devblogs.microsoft.com/typescript/announcing-typescript-5-7/",
        },
      ],
    });
  });

  it("returns no sources when deterministic fixtures do not match", async () => {
    const search = createMockInternetSearch();

    await expect(
      search.search(
        { maxResults: 5, query: "unmatched subject" },
        { now: deterministicTestNow },
      ),
    ).resolves.toEqual({
      answer: "",
      citations: [],
      sources: [],
    });
  });
});
