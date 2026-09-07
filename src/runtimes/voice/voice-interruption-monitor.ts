import {
  detectWakePhrase,
  normalizeSpokenText,
  stripWakePhrasePreservingCase,
} from "../../application/spoken-text.js";
import { waitForCleanupWithinDeadline } from "../bounded-cleanup.js";

export interface VoiceInterruptionRequest {
  readonly text: string;
  readonly wakePhrase: string;
}

export function startVoiceInterruptionMonitor(options: {
  capture(signal: AbortSignal): Promise<{ text: string }>;
  onRequest(request: VoiceInterruptionRequest): void;
  onCleanupFailure(error: Error): void;
  reportFailure(error: unknown): void;
  speechText(): string | undefined;
  wakePhrases: string[];
  signal?: AbortSignal;
  onCaptureState?(capturing: boolean): void;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
}): { stop(): Promise<void> } {
  const controller = new AbortController();
  const signal = options.signal
    ? AbortSignal.any([options.signal, controller.signal])
    : controller.signal;
  let stopping: Promise<void> | undefined;
  const work = listen();
  const timer = (options.setTimer ?? setTimeout)(() => {
    void stop();
  }, 30_000);
  timer.unref();
  void work.finally(() => (options.clearTimer ?? clearTimeout)(timer));

  return { stop };

  function stop(): Promise<void> {
    stopping ??= (async () => {
      controller.abort(new Error("Voice interruption capture ended."));
      const failure = await waitForCleanupWithinDeadline(
        work,
        1_000,
        "Voice interruption capture cleanup did not finish within 1000ms.",
      );
      if (failure) {
        try {
          options.onCleanupFailure(failure);
        } catch {
          /* Preserve the primary cleanup outcome. */
        }
      }
    })();
    return stopping;
  }

  async function listen(): Promise<void> {
    try {
      for (let captures = 0; captures < 3; captures += 1) {
        signal.throwIfAborted();
        let transcript: { text: string };
        try {
          options.onCaptureState?.(true);
          transcript = await options.capture(signal);
        } finally {
          options.onCaptureState?.(false);
        }
        signal.throwIfAborted();
        if (transcript.text.length > 4_000) continue;
        const detection = detectWakePhrase(
          transcript.text,
          options.wakePhrases,
        );
        if (!detection.detected || !detection.phrase) continue;
        const text = stripWakePhrasePreservingCase(
          transcript.text,
          options.wakePhrases,
        );
        const echo = normalizeSpokenText(options.speechText() ?? "");
        if (
          !text ||
          (echo && echo.includes(normalizeSpokenText(transcript.text)))
        )
          continue;
        options.onRequest({ text, wakePhrase: detection.phrase });
        return;
      }
    } catch (error) {
      if (!signal.aborted) {
        try {
          options.reportFailure(error);
        } catch {
          /* Diagnostic output is best effort. */
        }
      }
    }
  }
}
