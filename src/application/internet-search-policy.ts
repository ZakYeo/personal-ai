import type { InternetSearchResponse } from "../ports/internet-search.js";
import { containsControlCharacters } from "./text-safety.js";

export const internetSearchLimits = Object.freeze({
  answerCharacters: 4_000,
  extractCharacters: 2_000,
  projectionCharacters: 12_000,
  queryCharacters: 500,
  responseBodyBytes: 262_144,
  titleCharacters: 300,
  urlCharacters: 2_048,
});

export type InternetSearchCitationIntegrityFailure =
  | "bounds"
  | "duplicate_source"
  | "ordering"
  | "overlap"
  | "source_coverage"
  | "source_resolution";

interface CitationRange {
  endIndex: number;
  sourceId: string;
  startIndex: number;
}

interface CitationIntegrityInput {
  citations: readonly CitationRange[];
  createError?: (failure: InternetSearchCitationIntegrityFailure) => Error;
  sourceIds: readonly string[];
  textLength: number;
}

export function validateInternetSearchCitationIntegrity(
  input: CitationIntegrityInput,
): void {
  const sourceIds = new Set(input.sourceIds);
  if (sourceIds.size !== input.sourceIds.length) {
    throw createIntegrityError(input, "duplicate_source");
  }

  const citedSourceIds = new Set<string>();
  let previous: CitationRange | undefined;
  for (const citation of input.citations) {
    if (
      !Number.isInteger(citation.startIndex) ||
      !Number.isInteger(citation.endIndex) ||
      citation.startIndex < 0 ||
      citation.endIndex <= citation.startIndex ||
      citation.endIndex > input.textLength
    ) {
      throw createIntegrityError(input, "bounds");
    }
    if (!sourceIds.has(citation.sourceId)) {
      throw createIntegrityError(input, "source_resolution");
    }
    if (previous && citation.startIndex < previous.startIndex) {
      throw createIntegrityError(input, "ordering");
    }
    if (previous && citation.startIndex < previous.endIndex) {
      throw createIntegrityError(input, "overlap");
    }
    citedSourceIds.add(citation.sourceId);
    previous = citation;
  }

  if (
    citedSourceIds.size !== sourceIds.size ||
    input.sourceIds.some((sourceId) => !citedSourceIds.has(sourceId))
  ) {
    throw createIntegrityError(input, "source_coverage");
  }
}

export function validateInternetSearchResponse(
  response: InternetSearchResponse,
  maxResults: number,
): void {
  if (
    response.answer.length > internetSearchLimits.answerCharacters ||
    containsUnsafeSearchTextControls(response.answer) ||
    response.sources.length > maxResults ||
    response.sources.some(
      (source) =>
        source.title.length === 0 ||
        source.title.length > internetSearchLimits.titleCharacters ||
        containsControlCharacters(source.title) ||
        !isHttpUrl(source.url) ||
        source.url.length > internetSearchLimits.urlCharacters ||
        containsControlCharacters(source.url) ||
        (source.extract?.length ?? 0) >
          internetSearchLimits.extractCharacters ||
        (source.extract !== undefined &&
          containsUnsafeSearchTextControls(source.extract)),
    )
  ) {
    throw new Error("Internet search returned content outside safe bounds.");
  }

  validateInternetSearchCitationIntegrity({
    citations: response.citations,
    createError: () =>
      new Error(
        "Internet search returned citations that do not resolve to its source set.",
      ),
    sourceIds: response.sources.map((source) => source.id),
    textLength: response.answer.length,
  });

  const projectionCharacters =
    response.answer.length +
    response.sources.reduce(
      (total, source) =>
        total +
        source.id.length +
        source.title.length +
        source.url.length +
        (source.extract?.length ?? 0) +
        (source.publishedAt?.length ?? 0),
      0,
    );
  if (projectionCharacters > internetSearchLimits.projectionCharacters) {
    throw new Error("Internet search returned content outside safe bounds.");
  }
}

function containsUnsafeSearchTextControls(value: string): boolean {
  return containsControlCharacters(value.replace(/[\t\n\r]/gu, ""));
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function createIntegrityError(
  input: CitationIntegrityInput,
  failure: InternetSearchCitationIntegrityFailure,
): Error {
  return input.createError
    ? input.createError(failure)
    : new Error("Internet search citation integrity validation failed.");
}
