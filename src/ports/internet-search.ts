export const internetSearchLimits = Object.freeze({
  answerCharacters: 4_000,
  extractCharacters: 2_000,
  projectionCharacters: 12_000,
  queryCharacters: 500,
  responseBodyBytes: 262_144,
  titleCharacters: 300,
  urlCharacters: 2_048,
});

export interface InternetSearchQuery {
  maxResults: number;
  query: string;
}

export interface InternetSearchOptions {
  signal?: AbortSignal;
}

export interface InternetSearchCitation {
  endIndex: number;
  sourceId: string;
  startIndex: number;
}

export interface InternetSearchSource {
  extract?: string;
  id: string;
  publishedAt?: string;
  title: string;
  url: string;
}

export interface InternetSearchResponse {
  answer: string;
  citations: InternetSearchCitation[];
  sources: InternetSearchSource[];
}

export interface InternetSearchPort {
  search(
    query: InternetSearchQuery,
    options: InternetSearchOptions,
  ): Promise<InternetSearchResponse>;
}
