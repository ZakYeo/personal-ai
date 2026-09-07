import type { Assistant } from "../../core/assistant/index.js";
import type {
  PresentationControl,
  PresentationControlResult,
} from "../../ports/presentation.js";
import {
  logRuntimeFailure,
  readAssistantOutcome,
  recordPresentedOutcome,
  safeRuntimeFallbackResponse,
} from "../human-boundary.js";
import type { VoiceRuntimeIo } from "../voice/voice-runtime-io.js";
import type { AssistantRuntimeEventStream } from "./assistant-runtime-event-stream.js";
import type {
  PresentationInteraction,
  PresentationInteractionCoordinator,
} from "./presentation-interaction-coordinator.js";

interface PresentationControlContext {
  readonly attentionControl?: (
    control: Extract<PresentationControl, { type: "attention_update" }>,
  ) => Promise<Awaited<ReturnType<Assistant["handleText"]>>>;
  readonly assistant: Assistant;
  readonly eventStream: AssistantRuntimeEventStream;
  readonly io?: VoiceRuntimeIo;
  readonly interruptVoice?: () => Promise<void>;
  readonly interruptTurn?: () => Promise<void>;
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
      case "attention_update":
        return handleStoredControl(
          options,
          "Attention",
          options.attentionControl
            ? () => options.attentionControl!(control)
            : undefined,
        );
      case "confirm":
      case "decline":
        return handleConfirmationControl(options, control);
      case "dismiss_overlay":
        return { status: "accepted" };
      case "stop_listening":
        if (!options.interruptVoice)
          return {
            message: "Voice interruption is unavailable in this service.",
            status: "rejected",
          };
        await options.interruptVoice();
        return { status: "accepted" };
      case "submit_text":
        return handleTextControl(options, control.text);
      case "profile_explain":
      case "profile_forget":
      case "profile_set":
        return handleStoredControl(
          options,
          "Profile",
          options.profileControl
            ? () => options.profileControl!(control)
            : undefined,
        );
    }
  };
}

async function handleStoredControl(
  options: PresentationControlContext,
  label: "Profile" | "Attention",
  run:
    | (() => Promise<Awaited<ReturnType<Assistant["handleText"]>>>)
    | undefined,
): Promise<PresentationControlResult> {
  if (!run)
    return {
      message: `${label} controls are unavailable.`,
      status: "rejected",
    };
  const admitted = admitInput(options, false);
  if (!admitted) return busyResult;
  const { interaction } = admitted;
  interaction.transcriptFinal(
    label === "Profile" ? "Update personal profile" : "Update attention notice",
  );
  interaction.processing();
  let response: Awaited<ReturnType<Assistant["handleText"]>>;
  try {
    response = await run();
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
    pending.confirmation.sequence !== control.confirmationSequence ||
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
  await options.interruptTurn?.();
  interaction.processing();
  const outcome = await readAssistantOutcome(
    options.assistant,
    control.type === "confirm" ? "yes" : "no",
    options.io ?? {},
  );
  presentResponse(interaction, outcome.response);
  await recordPresentedOutcome(outcome, options.io ?? {});
  return { status: "accepted" };
}

async function handleTextControl(
  options: PresentationControlContext,
  text: string,
): Promise<PresentationControlResult> {
  const admitted = admitInput(options, true);
  if (!admitted) return busyResult;
  const { interaction, continuation } = admitted;
  if (continuation) await options.interruptTurn?.();
  interaction.transcriptFinal(text);
  interaction.processing();
  const outcome = await readAssistantOutcome(
    options.assistant,
    text,
    options.io ?? {},
  );
  presentResponse(interaction, outcome.response);
  await recordPresentedOutcome(outcome, options.io ?? {});
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
  if (!response.expectsFollowUp) interaction.completed();
}

const busyResult: PresentationControlResult = {
  status: "rejected",
  message: "Please finish the current interaction first.",
};

function admitInput(
  options: PresentationControlContext,
  allowContinuation: boolean,
): { interaction: PresentationInteraction; continuation: boolean } | undefined {
  const active = options.eventStream.snapshot().interaction;
  if (!active || ["completed", "cancelled", "failed"].includes(active.phase)) {
    return {
      interaction: options.presentation.beginInteraction(),
      continuation: false,
    };
  }
  if (
    !allowContinuation ||
    !["confirmation", "response", "listening"].includes(active.phase)
  )
    return;
  const interaction = options.presentation.continueInteraction(active.id);
  if (!interaction.continuationAvailable()) return;
  return interaction.claimContinuation()
    ? { interaction, continuation: true }
    : undefined;
}
