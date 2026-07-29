export const openAISpokenStyleInstruction =
  "Never include raw URLs, Markdown links, citation brackets, or internal identifiers in spoken text; refer to sources by their natural titles.";

export function isOpenAISpokenTextSafe(text: string): boolean {
  return (
    !/https?:\/\//iu.test(text) &&
    !/\bwww\./iu.test(text) &&
    !/\[[^\]]+\]\([^)]+\)/u.test(text) &&
    !/\[\d+\]/u.test(text)
  );
}
