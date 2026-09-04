import type { Assistant } from "../../core/assistant/index.js";
import type {
  PresentationControl,
  PresentationControlResult,
} from "../../ports/presentation.js";
import { handleAssistantText } from "../voice/voice-response.js";
import type { VoiceRuntimeIo } from "../voice/voice-runtime-io.js";
import type { AssistantRuntimeEventStream } from "./assistant-runtime-event-stream.js";
import type {
  PresentationInteraction,
  PresentationInteractionCoordinator,
} from "./presentation-interaction-coordinator.js";

interface PresentationControlContext {
  readonly assistant: Assistant;
  readonly eventStream: AssistantRuntimeEventStream;
  readonly io?: VoiceRuntimeIo;
  readonly presentation: PresentationInteractionCoordinator;
}

export function createPresentationControlHandler(
  options: PresentationControlContext,
): (control: PresentationControl) => Promise<PresentationControlResult> {
  return async (control) => {
    switch (control.type) {
      case "confirm":
      case "decline":
        return handleConfirmationControl(options, control);
      case "dismiss_overlay":
        return { status: "accepted" };
      case "stop_listening":
        return {
          message: "Voice interruption is not available yet.",
          status: "rejected",
        };
      case "submit_text":
        return handleTextControl(options, control.text);
    }
  };
}

async function handleConfirmationControl(
  options: PresentationControlContext,
  control: Extract<PresentationControl, { type: "confirm" | "decline" }>,
): Promise<PresentationControlResult> {
  const pending = options.eventStream.snapshot().interaction;
  if (
    pending?.id !== control.interactionId ||
    pending.phase !== "confirmation"
  ) {
    return {
      message: "That confirmation is no longer pending.",
      status: "rejected",
    };
  }
  const interaction = options.presentation.continueInteraction(pending.id);
  interaction.processing();
  const response = await handleAssistantText(
    options.assistant,
    control.type === "confirm" ? "yes" : "no",
    options.io ?? {},
  );
  presentResponse(interaction, response);
  return { status: "accepted" };
}

async function handleTextControl(
  options: PresentationControlContext,
  text: string,
): Promise<PresentationControlResult> {
  const interaction = options.presentation.beginInteraction();
  interaction.transcriptFinal(text);
  interaction.processing();
  const response = await handleAssistantText(
    options.assistant,
    text,
    options.io ?? {},
  );
  presentResponse(interaction, response);
  return { status: "accepted" };
}

function presentResponse(
  interaction: PresentationInteraction,
  response: Awaited<ReturnType<Assistant["handleText"]>>,
): void {
  if (response.status === "needs_confirmation") {
    interaction.confirmation(response.text);
    return;
  }
  interaction.response(response);
  interaction.completed();
}
