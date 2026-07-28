import type {
  InternetSearchPort,
  InternetSearchResult,
} from "../../ports/internet-search.js";

const results: readonly InternetSearchResult[] = [
  {
    extract:
      "TypeScript 5.7 adds checks for variables that have never been initialized.",
    id: "typescript-5-7",
    publishedAt: "2024-11-22T00:00:00.000Z",
    title: "Announcing TypeScript 5.7",
    url: "https://devblogs.microsoft.com/typescript/announcing-typescript-5-7/",
  },
];

export function createMockInternetSearch(): InternetSearchPort {
  return {
    search: (query) => {
      const queryTerms = query.query.trim().toLowerCase().split(/\s+/u);
      const matches = results.filter((result) => {
        const searchableText =
          `${result.title} ${result.extract}`.toLowerCase();

        return queryTerms.every((term) => searchableText.includes(term));
      });

      return Promise.resolve(matches.slice(0, query.maxResults));
    },
  };
}
