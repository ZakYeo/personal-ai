export interface InternetSearchQuery {
  maxResults: number;
  query: string;
}

export interface InternetSearchOptions {
  now: Date;
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
