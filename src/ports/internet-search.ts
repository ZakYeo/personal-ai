export interface InternetSearchQuery {
  maxResults: number;
  query: string;
}

export interface InternetSearchOptions {
  now: Date;
}

export interface InternetSearchResult {
  extract: string;
  id: string;
  publishedAt?: string;
  title: string;
  url: string;
}

export interface InternetSearchPort {
  search(
    query: InternetSearchQuery,
    options: InternetSearchOptions,
  ): Promise<InternetSearchResult[]>;
}
