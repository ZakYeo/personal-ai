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

function createIntegrityError(
  input: CitationIntegrityInput,
  failure: InternetSearchCitationIntegrityFailure,
): Error {
  return input.createError
    ? input.createError(failure)
    : new Error("Internet search citation integrity validation failed.");
}
