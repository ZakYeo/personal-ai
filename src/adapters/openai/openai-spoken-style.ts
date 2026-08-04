import { isSpokenTextSafe } from "../../application/human-text.js";

export const openAISpokenStyleInstruction =
  "Never include raw URLs, Markdown links, citation brackets, or internal identifiers in spoken text; refer to sources by their natural titles. Use natural, conversational dates and local times; never emit ISO or RFC timestamps or IANA timezone identifiers.";

export function isOpenAISpokenTextSafe(text: string): boolean {
  return isSpokenTextSafe(text);
}
