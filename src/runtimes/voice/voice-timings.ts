export type VoiceTimingEventName =
  | "wake_detected"
  | "local_feedback"
  | "capture_completed"
  | "first_transcript"
  | "first_audio_submitted"
  | "stop_recognized"
  | "barge_in_recognized"
  | "output_stopped";

interface VoiceTimingEvent {
  name: VoiceTimingEventName;
  offsetMs: number;
}

export interface VoiceTimingPhase {
  durationMs: number;
  name: string;
}

export interface VoiceTurnTimings {
  events?: readonly VoiceTimingEvent[];
  phases: VoiceTimingPhase[];
  totalMs: number;
}

interface VoiceTimingRecorder {
  mark(name: VoiceTimingEventName): void;
  measure<T>(name: string, operation: () => Promise<T>): Promise<T>;
  snapshot(): VoiceTurnTimings;
}

export type MonotonicNow = () => number;

export interface VoiceTimingOptions {
  nowMs?: MonotonicNow;
  onEvent?(
    this: void,
    event: Readonly<
      VoiceTimingEvent & { monotonicMs: number; startedAtMs: number }
    >,
  ): void;
}

export interface VoiceTurnInstrumentation {
  mark(name: VoiceTimingEventName): void;
  measure<T>(name: string, operation: () => Promise<T>): Promise<T>;
  snapshotIfEnabled(): VoiceTurnTimings | undefined;
}

export function createVoiceTimingRecorder(
  nowMs: MonotonicNow = defaultMonotonicNow,
  onEvent?: VoiceTimingOptions["onEvent"],
): VoiceTimingRecorder {
  const phases: VoiceTimingPhase[] = [];
  const events = new Map<VoiceTimingEventName, number>();
  const startedAt = nowMs();

  return {
    mark(name) {
      if (events.has(name)) return;
      const monotonicMs = nowMs();
      const offsetMs = elapsedMs(monotonicMs, startedAt);
      events.set(name, offsetMs);
      try {
        onEvent?.(
          Object.freeze({
            name,
            offsetMs,
            monotonicMs,
            startedAtMs: startedAt,
          }),
        );
      } catch {
        /* Optional observation cannot alter turn behavior. */
      }
    },
    async measure(name, operation) {
      const phaseStartedAt = nowMs();

      try {
        return await operation();
      } finally {
        phases.push({
          durationMs: elapsedMs(nowMs(), phaseStartedAt),
          name,
        });
      }
    },
    snapshot() {
      return {
        ...(events.size
          ? {
              events: [...events].map(([name, offsetMs]) => ({
                name,
                offsetMs,
              })),
            }
          : {}),
        phases: [...phases],
        totalMs: elapsedMs(nowMs(), startedAt),
      };
    },
  };
}

export function createVoiceTurnInstrumentation(
  options?: VoiceTimingOptions,
): VoiceTurnInstrumentation {
  if (!options) {
    return {
      mark: () => {},
      measure: (_name, operation) => operation(),
      snapshotIfEnabled: noTimings,
    };
  }

  const recorder = createVoiceTimingRecorder(options.nowMs, options.onEvent);

  return {
    mark: (name) => recorder.mark(name),
    measure: (name, operation) => recorder.measure(name, operation),
    snapshotIfEnabled: () => recorder.snapshot(),
  };
}

export function formatVoiceTimings(timings: VoiceTurnTimings): string[] {
  return [
    "Voice timing summary:",
    ...timings.phases.map(
      (phase) => `- ${phase.name}: ${formatDurationMs(phase.durationMs)}`,
    ),
    ...formatResponsiveness(timings),
    `- total: ${formatDurationMs(timings.totalMs)}`,
  ];
}

function elapsedMs(finishedAt: number, startedAt: number): number {
  return Math.max(0, Math.round(finishedAt - startedAt));
}

function noTimings(): VoiceTurnTimings | undefined {
  return;
}

function formatDurationMs(durationMs: number): string {
  return `${durationMs}ms`;
}

function defaultMonotonicNow(): number {
  return performance.now();
}

function formatResponsiveness(timings: VoiceTurnTimings): string[] {
  const events = new Map(
    timings.events?.map((event) => [event.name, event.offsetMs]),
  );
  const intervals: readonly [
    VoiceTimingEventName,
    VoiceTimingEventName,
    string,
    string,
  ][] = [
    ["wake_detected", "local_feedback", "detected wake to local feedback", ""],
    [
      "stop_recognized",
      "output_stopped",
      "recognized stop to output cleanup",
      " (software boundary; acoustic silence unmeasured)",
    ],
    [
      "barge_in_recognized",
      "output_stopped",
      "recognized replacement to output cleanup",
      " (software boundary; acoustic silence unmeasured)",
    ],
    [
      "capture_completed",
      "first_transcript",
      "capture completion to first transcript",
      "",
    ],
    [
      "capture_completed",
      "first_audio_submitted",
      "capture completion to first audio submission",
      " (software boundary; acoustic onset unmeasured)",
    ],
  ];
  return intervals.flatMap(([start, end, label, note]) => {
    const from = events.get(start);
    const to = events.get(end);
    return from === undefined || to === undefined
      ? []
      : [`- ${label}: ${formatDurationMs(to - from)}${note}`];
  });
}
