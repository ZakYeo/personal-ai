import type {
  InternetSearchPort,
  InternetSearchSource,
} from "../../ports/internet-search.js";

const sources: readonly InternetSearchSource[] = [
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
      const matches = sources.filter((result) => {
        const searchableText =
          `${result.title} ${result.extract}`.toLowerCase();

        return queryTerms.every((term) => searchableText.includes(term));
      });

      const selected = matches.slice(0, query.maxResults);
      const answer =
        selected.length === 0
          ? ""
          : `${selected[0]!.extract ?? selected[0]!.title} [1]`;

      return Promise.resolve({
        answer,
        citations:
          selected.length === 0
            ? []
            : [
                {
                  endIndex: answer.length,
                  sourceId: selected[0]!.id,
                  startIndex: answer.length - 3,
                },
              ],
        sources: selected,
      });
    },
  };
}
