import type {
  AssistantCitation,
  AssistantResponse,
} from "../ports/assistant.js";
import { containsControlCharacters } from "../ports/text-safety.js";

interface AssistantResponseRenderingOptions {
  hyperlinks?: boolean;
}

export function renderAssistantResponseText(
  response: AssistantResponse,
  options: AssistantResponseRenderingOptions = {},
): string {
  if (!options.hyperlinks || !response.citations) return response.text;

  return renderCitationLinks(response.text, response.citations);
}

interface CitationMatch {
  endIndex: number;
  order: number;
  startIndex: number;
  title: string;
  url: string;
}

function renderCitationLinks(
  text: string,
  citations: readonly AssistantCitation[],
): string {
  const candidates = createCitationMatches(text, citations);
  const selected: CitationMatch[] = [];
  let selectedEnd = 0;
  for (const candidate of candidates) {
    if (candidate.startIndex < selectedEnd) continue;
    selected.push(candidate);
    selectedEnd = candidate.endIndex;
  }

  let rendered = "";
  let cursor = 0;
  for (const match of selected) {
    rendered += text.slice(cursor, match.startIndex);
    rendered += `\u001B]8;;${match.url}\u0007${match.title}\u001B]8;;\u0007`;
    cursor = match.endIndex;
  }
  return rendered + text.slice(cursor);
}

function createCitationMatches(
  text: string,
  citations: readonly AssistantCitation[],
): CitationMatch[] {
  const matches: CitationMatch[] = [];
  const seenTitles = new Set<string>();
  citations.forEach((citation, order) => {
    if (
      citation.title.length === 0 ||
      seenTitles.has(citation.title) ||
      containsControlCharacters(citation.title) ||
      containsControlCharacters(citation.url)
    ) {
      return;
    }
    const url = parseHttpUrl(citation.url);
    if (!url) return;
    seenTitles.add(citation.title);

    let startIndex = text.indexOf(citation.title);
    while (startIndex >= 0) {
      matches.push({
        endIndex: startIndex + citation.title.length,
        order,
        startIndex,
        title: citation.title,
        url,
      });
      startIndex = text.indexOf(
        citation.title,
        startIndex + citation.title.length,
      );
    }
  });
  return matches.sort(
    (left, right) =>
      left.startIndex - right.startIndex ||
      right.title.length - left.title.length ||
      left.order - right.order,
  );
}

function parseHttpUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : undefined;
  } catch {
    return;
  }
}
