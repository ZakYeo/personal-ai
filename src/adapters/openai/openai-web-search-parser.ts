import type {
  InternetSearchCitation,
  InternetSearchResponse,
  InternetSearchSource,
} from "../../ports/internet-search.js";
import { isRecord } from "../parsing.js";
import { OpenAIWebSearchError } from "./openai-web-search-error.js";

export function parseOpenAIWebSearchResponse(
  value: unknown,
  maxResults: number,
): InternetSearchResponse {
  if (!isRecord(value)) {
    throw new OpenAIWebSearchError(
      "OpenAI web search response body must be an object.",
    );
  }
  if (!Array.isArray(value.output)) {
    throw missingOutputTextError();
  }

  for (const outputItem of value.output) {
    const parsed = parseMessage(outputItem, maxResults);
    if (parsed) return parsed;
  }

  throw missingOutputTextError();
}

function parseMessage(
  value: unknown,
  maxResults: number,
): InternetSearchResponse | undefined {
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
      return parseCitedAnswer(content, maxResults);
    }
  }
}

function parseCitedAnswer(
  content: Record<string, unknown>,
  maxResults: number,
): InternetSearchResponse {
  if (!Array.isArray(content.annotations)) {
    throw missingCitationsError();
  }

  const answer = content.text as string;
  const sources: InternetSearchSource[] = [];
  const citations: InternetSearchCitation[] = [];
  const sourceByUrl = new Map<string, InternetSearchSource>();

  for (const annotation of content.annotations) {
    if (!isRecord(annotation) || annotation.type !== "url_citation") continue;
    const parsed = parseCitation(annotation, answer);
    let source = sourceByUrl.get(parsed.url);
    if (!source) {
      if (sources.length >= maxResults) {
        throw new OpenAIWebSearchError(
          "OpenAI web search response exceeded the configured source limit.",
        );
      }
      source = {
        id: `openai-search-source-${sources.length + 1}`,
        title: parsed.title,
        url: parsed.url,
      };
      sources.push(source);
      sourceByUrl.set(source.url, source);
    }
    citations.push({
      endIndex: parsed.endIndex,
      sourceId: source.id,
      startIndex: parsed.startIndex,
    });
  }

  if (citations.length === 0) throw missingCitationsError();

  return { answer, citations, sources };
}

function parseCitation(
  value: Record<string, unknown>,
  answer: string,
): {
  endIndex: number;
  startIndex: number;
  title: string;
  url: string;
} {
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
    (value.end_index as number) > answer.length
  ) {
    throw new OpenAIWebSearchError(
      "OpenAI web search citation indexes are invalid.",
    );
  }

  return {
    endIndex: value.end_index as number,
    startIndex: value.start_index as number,
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

function missingOutputTextError(): OpenAIWebSearchError {
  return new OpenAIWebSearchError(
    "OpenAI web search response did not include output text.",
  );
}

function missingCitationsError(): OpenAIWebSearchError {
  return new OpenAIWebSearchError(
    "OpenAI web search response did not include URL citations.",
  );
}
