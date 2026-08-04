import type { AssistantContext } from "../ports/assistant.js";
import type { ConversationState } from "../ports/conversation.js";
import type {
  IntentInterpretation,
  IntentInterpreterPort,
} from "../ports/intent.js";

export function interpretOnce(
  interpreter: IntentInterpreterPort,
  text: string,
  context: AssistantContext,
  history?: ConversationState,
): Promise<IntentInterpretation> {
  return interpreter.start(text, context, history).next();
}
