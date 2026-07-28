import type { InternetSearchResult } from "../../ports/internet-search.js";
import { isRecord } from "../parsing.js";
import { OpenAIWebSearchError } from "./openai-web-search-error.js";

export function parseOpenAIWebSearchResponse(
  value: unknown,
  maxResults: number,
): InternetSearchResult[] {
  if (!isRecord(value)) {
    throw new OpenAIWebSearchError(
      "OpenAI web search response body must be an object.",
    );
  }
  if (!Array.isArray(value.output)) {
    throw new OpenAIWebSearchError(
      "OpenAI web search response did not include output text.",
    );
  }

  for (const outputItem of value.output) {
    const parsed = parseMessage(outputItem, maxResults);
    if (parsed) return parsed;
  }

  throw new OpenAIWebSearchError(
    "OpenAI web search response did not include output text.",
  );
}

function parseMessage(
  value: unknown,
  maxResults: number,
): InternetSearchResult[] | undefined {
  if (
    !isRecord(value) ||
    value.type !== "message" ||
    !Array.isArray(value.content)
  ) {
    return;
  }

  for (const content of value.content) {
    if (
      isRecord(content) &&
      content.type === "output_text" &&
      typeof content.text === "string" &&
      content.text.trim().length > 0
    ) {
      return parseCitations(content, maxResults);
    }
  }
}

function parseCitations(
  content: Record<string, unknown>,
  maxResults: number,
): InternetSearchResult[] {
  if (!Array.isArray(content.annotations)) {
    throw new OpenAIWebSearchError(
      "OpenAI web search response did not include URL citations.",
    );
  }

  const text = content.text as string;
  const results: InternetSearchResult[] = [];
  const seenUrls = new Set<string>();

  for (const annotation of content.annotations) {
    if (!isRecord(annotation) || annotation.type !== "url_citation") continue;
    const citation = parseCitation(annotation, text, results.length);
    if (!seenUrls.has(citation.url)) {
      results.push(citation);
      seenUrls.add(citation.url);
    }
    if (results.length >= maxResults) break;
  }

  if (results.length === 0) {
    throw new OpenAIWebSearchError(
      "OpenAI web search response did not include URL citations.",
    );
  }

  return results;
}

function parseCitation(
  value: Record<string, unknown>,
  text: string,
  index: number,
): InternetSearchResult {
  if (typeof value.title !== "string" || value.title.trim().length === 0) {
    throw new OpenAIWebSearchError(
      "OpenAI web search citation title must be a non-empty string.",
    );
  }
  if (typeof value.url !== "string" || !isSafeWebUrl(value.url)) {
    throw new OpenAIWebSearchError(
      "OpenAI web search citation URL must use HTTP or HTTPS.",
    );
  }
  if (
    !Number.isInteger(value.start_index) ||
    !Number.isInteger(value.end_index) ||
    (value.start_index as number) < 0 ||
    (value.end_index as number) <= (value.start_index as number) ||
    (value.end_index as number) > text.length
  ) {
    throw new OpenAIWebSearchError(
      "OpenAI web search citation indexes are invalid.",
    );
  }

  return {
    extract: text,
    id: `openai-search-source-${index + 1}`,
    title: value.title,
    url: value.url,
  };
}

function isSafeWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
