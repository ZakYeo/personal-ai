export interface VoiceTimingPhase {
  durationMs: number;
  name: string;
}

export interface VoiceTurnTimings {
  phases: VoiceTimingPhase[];
  totalMs: number;
}

export interface VoiceTimingRecorder {
  measure<T>(name: string, operation: () => Promise<T>): Promise<T>;
  snapshot(): VoiceTurnTimings;
}

export type MonotonicNow = () => number;

export function createVoiceTimingRecorder(
  nowMs: MonotonicNow = defaultMonotonicNow,
): VoiceTimingRecorder {
  const phases: VoiceTimingPhase[] = [];
  const startedAt = nowMs();

  return {
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
        phases: [...phases],
        totalMs: elapsedMs(nowMs(), startedAt),
      };
    },
  };
}

export function formatVoiceTimings(timings: VoiceTurnTimings): string[] {
  return [
    "Voice timing summary:",
    ...timings.phases.map(
      (phase) => `- ${phase.name}: ${formatDurationMs(phase.durationMs)}`,
    ),
    `- total: ${formatDurationMs(timings.totalMs)}`,
  ];
}

function elapsedMs(finishedAt: number, startedAt: number): number {
  return Math.max(0, Math.round(finishedAt - startedAt));
}

function formatDurationMs(durationMs: number): string {
  return `${durationMs}ms`;
}

function defaultMonotonicNow(): number {
  return performance.now();
}
