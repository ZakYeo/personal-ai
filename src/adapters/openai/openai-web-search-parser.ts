import type {
  InternetSearchCitation,
  InternetSearchResponse,
  InternetSearchSource,
} from "../../ports/internet-search.js";
import { internetSearchLimits } from "../../ports/internet-search.js";
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
  if (answer.length > internetSearchLimits.answerCharacters) {
    throw contentBoundsError();
  }
  const parsedCitations = content.annotations
    .filter(
      (annotation): annotation is Record<string, unknown> =>
        isRecord(annotation) && annotation.type === "url_citation",
    )
    .map((annotation) => parseCitation(annotation, answer))
    .sort(
      (left, right) =>
        left.startIndex - right.startIndex || left.endIndex - right.endIndex,
    );
  validateNonOverlappingCitations(parsedCitations);

  const sources: InternetSearchSource[] = [];
  const sourceByUrl = new Map<string, InternetSearchSource>();

  for (const parsed of parsedCitations) {
    let source = sourceByUrl.get(parsed.url);
    if (!source) {
      if (sources.length >= maxResults) continue;
      source = {
        id: `openai-search-source-${sources.length + 1}`,
        title: parsed.title,
        url: parsed.url,
      };
      sources.push(source);
      sourceByUrl.set(source.url, source);
    }
  }

  if (parsedCitations.length === 0) throw missingCitationsError();

  return projectSelectedCitations(
    answer,
    parsedCitations,
    sourceByUrl,
    sources,
  );
}

interface ParsedCitation {
  endIndex: number;
  startIndex: number;
  title: string;
  url: string;
}

function parseCitation(
  value: Record<string, unknown>,
  answer: string,
): ParsedCitation {
  if (typeof value.title !== "string" || value.title.trim().length === 0) {
    throw new OpenAIWebSearchError(
      "OpenAI web search citation title must be a non-empty string.",
    );
  }
  if (value.title.length > internetSearchLimits.titleCharacters) {
    throw contentBoundsError();
  }
  if (typeof value.url !== "string" || !isSafeWebUrl(value.url)) {
    throw new OpenAIWebSearchError(
      "OpenAI web search citation URL must use HTTP or HTTPS.",
    );
  }
  if (value.url.length > internetSearchLimits.urlCharacters) {
    throw contentBoundsError();
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

function validateNonOverlappingCitations(
  citations: readonly ParsedCitation[],
): void {
  for (let index = 1; index < citations.length; index += 1) {
    if (citations[index]!.startIndex < citations[index - 1]!.endIndex) {
      throw new OpenAIWebSearchError(
        "OpenAI web search citation ranges must not overlap.",
      );
    }
  }
}

function projectSelectedCitations(
  answer: string,
  parsedCitations: readonly ParsedCitation[],
  sourceByUrl: ReadonlyMap<string, InternetSearchSource>,
  sources: InternetSearchSource[],
): InternetSearchResponse {
  const citations: InternetSearchCitation[] = [];
  let projectedAnswer = "";
  let cursor = 0;

  for (const parsed of parsedCitations) {
    projectedAnswer += answer.slice(cursor, parsed.startIndex);
    const source = sourceByUrl.get(parsed.url);
    if (source) {
      const citationText = answer.slice(parsed.startIndex, parsed.endIndex);
      const startIndex = projectedAnswer.length;
      projectedAnswer += citationText;
      citations.push({
        endIndex: projectedAnswer.length,
        sourceId: source.id,
        startIndex,
      });
    }
    cursor = parsed.endIndex;
  }

  projectedAnswer += answer.slice(cursor);
  return { answer: projectedAnswer, citations, sources };
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

function contentBoundsError(): OpenAIWebSearchError {
  return new OpenAIWebSearchError(
    "OpenAI web search response contained content outside safe bounds.",
  );
}
