import type { Assistant } from "../../core/assistant/index.js";
import type {
  PresentationControl,
  PresentationControlResult,
} from "../../ports/presentation.js";
import {
  logRuntimeFailure,
  safeRuntimeFallbackResponse,
} from "../human-boundary.js";
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
  readonly profileControl?: (
    control: Extract<
      PresentationControl,
      { type: "profile_explain" | "profile_forget" | "profile_set" }
    >,
  ) => Promise<Awaited<ReturnType<Assistant["handleText"]>>>;
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
      case "profile_explain":
      case "profile_forget":
      case "profile_set":
        return handleProfileControl(options, control);
    }
  };
}

async function handleProfileControl(
  options: PresentationControlContext,
  control: Extract<
    PresentationControl,
    { type: "profile_explain" | "profile_forget" | "profile_set" }
  >,
): Promise<PresentationControlResult> {
  if (!options.profileControl) {
    return { message: "Profile controls are unavailable.", status: "rejected" };
  }
  const interaction = options.presentation.beginInteraction();
  interaction.transcriptFinal("Update personal profile");
  interaction.processing();
  let response: Awaited<ReturnType<Assistant["handleText"]>>;
  try {
    response = await options.profileControl(control);
  } catch (error) {
    logRuntimeFailure(error, options.io ?? {});
    response = safeRuntimeFallbackResponse;
  }
  presentResponse(interaction, response);
  return { status: "accepted" };
}

async function handleConfirmationControl(
  options: PresentationControlContext,
  control: Extract<PresentationControl, { type: "confirm" | "decline" }>,
): Promise<PresentationControlResult> {
  const pending = options.eventStream.snapshot().interaction;
  if (
    pending?.id !== control.interactionId ||
    !pending.confirmation ||
    (pending.phase !== "confirmation" && pending.phase !== "listening")
  ) {
    return {
      message: "That confirmation is no longer pending.",
      status: "rejected",
    };
  }
  const interaction = options.presentation.continueInteraction(pending.id);
  if (!interaction.claimContinuation()) {
    return {
      message: "That confirmation was already answered.",
      status: "rejected",
    };
  }
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
