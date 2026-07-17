import type { VoiceBenchmarkPolicy } from "./benchmark-policy.js";
import type {
  AggregatedBenchmark,
  AggregatedCandidate,
} from "./benchmark-aggregate.js";
import { percentile } from "./benchmark-metrics.js";

interface CandidateSummary {
  candidateId: string;
  correctness: string;
  latencyMs: number;
  outcome: string;
  peakRssBytes: number;
  realTimeFactor: number;
}

export function renderDesktopBenchmarkReport(
  result: AggregatedBenchmark,
  policy: VoiceBenchmarkPolicy,
): string {
  const summaries = result.candidates.map((candidate) =>
    summarizeCandidate(candidate, policy),
  );
  const device = result.device;
  return `# Desktop WSL2 Local Voice Benchmark

Run date: ${result.startedAt.slice(0, 10)}. Device: ${requireString(device.cpu, "device.cpu")}, ${requireString(device.architecture, "device.architecture")}, ${requireString(device.os, "device.os")} ${requireString(device.kernel, "device.kernel")}.

## Outcome

This is a desktop-only, partial acceptance run. No candidate is eligible for selection: every candidate has a measured hard failure or execution failure, and the run did not independently prove network isolation, installed size, shutdown latency, thermal state, or Raspberry Pi fitness. Raspberry Pi measurements remain deferred because no Pi was available.

| Candidate | Correctness | P95 measured latency | P95 RTF | Peak RSS | Outcome |
| --- | ---: | ---: | ---: | ---: | --- |
${summaries.map(renderRow).join("\n")}

Each sample used one excluded warm-up and three measured repetitions. STT latency is offline process completion after reported model startup, not post-speech streaming finalization. TTS latency is conservative batch-ready WAV completion, not first streaming audio. The minimal child environment is recorded, but it is not evidence of network isolation. Shutdown was not measured and is therefore unavailable rather than zero. WSL2 thermal telemetry, installed-size accounting, and a provenance-compliant LibriSpeech reference corpus were also unavailable.

Subjective TTS ratings were not collected because both TTS candidates failed the measured hard performance gate. Raw measurements are committed in \`desktop-wsl2.json\`; generated audio, timing files, engines, and models remain private ignored artifacts.
`;
}

function summarizeCandidate(
  candidate: AggregatedCandidate,
  policy: VoiceBenchmarkPolicy,
): CandidateSummary {
  const repetitions = candidate.samples.flatMap((sample) =>
    requireArray(sample.repetitions, "sample.repetitions"),
  );
  const successful = repetitions
    .map((value) => requireRecord(value, "repetition"))
    .filter((repetition) => repetition.ok === true);
  const executionFailures = repetitions.length - successful.length;
  const realTimeFactors = numbers(successful, "realTimeFactor");
  const peakRssBytes = Math.max(0, ...numbers(successful, "peakRssBytes"));
  if (candidate.kind === "stt") {
    const exact = candidate.samples.filter(
      (sample) => sample.exactMatch === true,
    ).length;
    const wordErrorRates = candidate.samples
      .map((sample) => sample.wordErrorRate)
      .filter((value): value is number => typeof value === "number");
    const latency = numbers(successful, "finalizationMs");
    const failures = [
      ...(exact / candidate.samples.length < policy.personalExactMatchRate
        ? ["accuracy"]
        : []),
      ...(latency.length === 0 ||
      percentile(latency, 0.95) >
        policy.devices["desktop-wsl2"].sttFinalizationP95Ms
        ? ["latency"]
        : []),
      ...(realTimeFactors.length === 0 ||
      percentile(realTimeFactors, 0.95) >
        policy.devices["desktop-wsl2"].sttRealTimeFactorP95
        ? ["RTF"]
        : []),
      ...(executionFailures > 0
        ? [`${executionFailures} execution failures`]
        : []),
    ];
    return {
      candidateId: candidate.candidateId,
      correctness: `${exact}/${candidate.samples.length} exact; ${percent(mean(wordErrorRates))} mean personal WER`,
      latencyMs: latency.length === 0 ? 0 : percentile(latency, 0.95),
      outcome: `No-go: ${failures.join(", ") || "required evidence unavailable"}`,
      peakRssBytes,
      realTimeFactor:
        realTimeFactors.length === 0 ? 0 : percentile(realTimeFactors, 0.95),
    };
  }
  const latency = numbers(successful, "firstAudioMs");
  const failures = [
    ...(latency.length === 0 ||
    percentile(latency, 0.95) >
      policy.devices["desktop-wsl2"].ttsFirstAudioP95Ms
      ? ["batch-ready latency"]
      : []),
    ...(realTimeFactors.length === 0 ||
    percentile(realTimeFactors, 0.95) >
      policy.devices["desktop-wsl2"].ttsRealTimeFactorP95
      ? ["RTF"]
      : []),
    ...(executionFailures > 0
      ? [`${executionFailures} execution failures`]
      : []),
  ];
  return {
    candidateId: candidate.candidateId,
    correctness: "Ratings skipped after hard failure",
    latencyMs: latency.length === 0 ? 0 : percentile(latency, 0.95),
    outcome: `No-go: ${failures.join(", ") || "required evidence unavailable"}`,
    peakRssBytes,
    realTimeFactor:
      realTimeFactors.length === 0 ? 0 : percentile(realTimeFactors, 0.95),
  };
}

function renderRow(summary: CandidateSummary): string {
  return `| ${summary.candidateId} | ${summary.correctness} | ${Math.round(summary.latencyMs).toLocaleString("en-GB")} ms | ${summary.realTimeFactor.toFixed(3)} | ${Math.round(summary.peakRssBytes / 1_000_000)} MB | ${summary.outcome} |`;
}

function numbers(records: Record<string, unknown>[], field: string): number[] {
  return records.map((record) => {
    const value = record[field];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new Error(`${field} must be a nonnegative number.`);
    }
    return value;
  });
}

function mean(values: number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((total, value) => total + value, 0) / values.length;
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value === "")
    throw new Error(`${label} must be a string.`);
  return value;
}
