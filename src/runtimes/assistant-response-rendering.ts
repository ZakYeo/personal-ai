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

  return response.citations.reduce(
    (text, citation) => renderCitationLink(text, citation),
    response.text,
  );
}

function renderCitationLink(text: string, citation: AssistantCitation): string {
  if (
    citation.title.length === 0 ||
    containsControlCharacters(citation.title) ||
    containsControlCharacters(citation.url)
  ) {
    return text;
  }

  const url = parseHttpUrl(citation.url);
  if (!url || !text.includes(citation.title)) return text;

  const link = `\u001B]8;;${url}\u0007${citation.title}\u001B]8;;\u0007`;
  return text.split(citation.title).join(link);
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
