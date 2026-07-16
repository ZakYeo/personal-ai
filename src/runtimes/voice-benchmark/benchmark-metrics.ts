import type { VoiceBenchmarkPolicy } from "./benchmark-policy.js";

type VoiceBenchmarkDevice = "desktop-wsl2" | "pi5";

interface SharedPerformanceMeasurements {
  device: VoiceBenchmarkDevice;
  installBytes: number;
  newThermalThrottling: boolean | "unavailable";
  offlineSucceeded: boolean;
  peakRssBytes: number;
  realTimeFactors: readonly number[];
  shutdownMs: number;
  startupMs: number;
}

interface SttMeasurements extends SharedPerformanceMeasurements {
  commandMatches: readonly boolean[];
  finalizationMs: readonly number[];
  referenceWordErrorRates: readonly number[];
}

interface TtsMeasurements extends SharedPerformanceMeasurements {
  firstAudioMs: readonly number[];
  intelligibilityRatings: readonly number[];
  materialFactErrors: number;
  naturalnessRatings: readonly number[];
}

interface BenchmarkGateResult {
  failures: string[];
  passed: boolean;
}

interface CandidateSelectionResult {
  candidateId: string;
  desktopPassed: boolean;
  pi: {
    correctness: number;
    installBytes: number;
    latencyMs: number;
    peakRssBytes: number;
    realTimeFactor: number;
  };
  piPassed: boolean;
}

interface DesktopCandidateSelectionResult {
  candidateId: string;
  correctness: number;
  installBytes: number;
  latencyMs: number;
  passed: boolean;
  peakRssBytes: number;
  quality: number;
  realTimeFactor: number;
}

export function normalizeTranscript(transcript: string): string {
  return transcript
    .normalize("NFKC")
    .toLocaleLowerCase("en-GB")
    .replaceAll(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .replaceAll(/\s+/gu, " ");
}

export function calculateWordErrorRate(
  expected: string,
  actual: string,
): number {
  const expectedWords = words(expected);
  const actualWords = words(actual);

  if (expectedWords.length === 0) {
    return actualWords.length;
  }

  return editDistance(expectedWords, actualWords) / expectedWords.length;
}

export function percentile(
  values: readonly number[],
  quantile: number,
): number {
  if (values.length === 0) {
    throw new Error("Cannot calculate a percentile from no values.");
  }
  if (quantile <= 0 || quantile > 1) {
    throw new Error(
      "Percentile quantile must be greater than zero and at most one.",
    );
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.ceil(quantile * sorted.length) - 1;
  const value = sorted[index];

  if (value === undefined) {
    throw new Error("Percentile value could not be selected.");
  }

  return value;
}

export function evaluateSttMeasurements(
  measurements: SttMeasurements,
  policy: VoiceBenchmarkPolicy,
): BenchmarkGateResult {
  const failures: string[] = [];
  const devicePolicy = policy.devices[measurements.device];

  addFailure(
    failures,
    measurements.commandMatches.length < policy.minimumPersonalSamples ||
      measurements.commandMatches.filter(Boolean).length /
        measurements.commandMatches.length <
        policy.personalExactMatchRate,
    `Personal command corpus has fewer than ${policy.minimumPersonalSamples} samples or exact-match accuracy is below ${policy.personalExactMatchRate * 100}%.`,
  );
  addFailure(
    failures,
    mean(measurements.referenceWordErrorRates) > policy.referenceWordErrorRate,
    `Reference word error rate exceeds ${policy.referenceWordErrorRate * 100}%.`,
  );
  addFailure(
    failures,
    percentile(measurements.finalizationMs, 0.95) >
      devicePolicy.sttFinalizationP95Ms,
    "Finalization latency exceeds the device threshold.",
  );
  addSharedPerformanceFailures(
    failures,
    measurements,
    devicePolicy.sttRealTimeFactorP95,
    policy,
  );

  return { failures, passed: failures.length === 0 };
}

export function evaluateTtsMeasurements(
  measurements: TtsMeasurements,
  policy: VoiceBenchmarkPolicy,
): BenchmarkGateResult {
  const failures: string[] = [];
  const devicePolicy = policy.devices[measurements.device];

  addFailure(
    failures,
    measurements.materialFactErrors > 0,
    "Material facts were pronounced incorrectly.",
  );
  addFailure(
    failures,
    mean(measurements.intelligibilityRatings) < policy.ttsIntelligibilityMean,
    `Mean intelligibility is below ${policy.ttsIntelligibilityMean}/5.`,
  );
  addFailure(
    failures,
    mean(measurements.naturalnessRatings) < policy.ttsNaturalnessMean,
    `Mean naturalness is below ${policy.ttsNaturalnessMean}/5.`,
  );
  addFailure(
    failures,
    percentile(measurements.firstAudioMs, 0.95) >
      devicePolicy.ttsFirstAudioP95Ms,
    "First-audio latency exceeds the device threshold.",
  );
  addSharedPerformanceFailures(
    failures,
    measurements,
    devicePolicy.ttsRealTimeFactorP95,
    policy,
  );

  return { failures, passed: failures.length === 0 };
}

export function selectPiSafeWinner(
  candidates: readonly CandidateSelectionResult[],
): string | null {
  const passing = candidates.filter(
    (candidate) => candidate.desktopPassed && candidate.piPassed,
  );

  passing.sort(
    (left, right) =>
      right.pi.correctness - left.pi.correctness ||
      left.pi.latencyMs - right.pi.latencyMs ||
      left.pi.realTimeFactor - right.pi.realTimeFactor ||
      left.pi.peakRssBytes - right.pi.peakRssBytes ||
      left.pi.installBytes - right.pi.installBytes ||
      left.candidateId.localeCompare(right.candidateId),
  );

  return passing[0]?.candidateId ?? null;
}

export function selectDesktopWinner(
  candidates: readonly DesktopCandidateSelectionResult[],
): string | null {
  const passing = candidates.filter((candidate) => candidate.passed);
  passing.sort(
    (left, right) =>
      right.correctness - left.correctness ||
      right.quality - left.quality ||
      left.latencyMs - right.latencyMs ||
      left.realTimeFactor - right.realTimeFactor ||
      left.peakRssBytes - right.peakRssBytes ||
      left.installBytes - right.installBytes ||
      left.candidateId.localeCompare(right.candidateId),
  );
  return passing[0]?.candidateId ?? null;
}

function addSharedPerformanceFailures(
  failures: string[],
  measurements: SharedPerformanceMeasurements,
  realTimeFactorThreshold: number,
  policy: VoiceBenchmarkPolicy,
): void {
  addFailure(
    failures,
    percentile(measurements.realTimeFactors, 0.95) > realTimeFactorThreshold,
    "Real-time factor exceeds the device threshold.",
  );
  addFailure(
    failures,
    measurements.peakRssBytes > policy.peakRssBytesMaximum,
    "Peak RSS exceeds 1.5 GiB.",
  );
  addFailure(
    failures,
    measurements.installBytes > policy.installBytesMaximum,
    "Installed runtime and model exceed 1 GiB.",
  );
  addFailure(
    failures,
    measurements.startupMs > policy.startupMaximumMs,
    "Startup exceeds five seconds.",
  );
  addFailure(
    failures,
    measurements.shutdownMs > policy.shutdownMaximumMs,
    "Shutdown exceeds two seconds.",
  );
  addFailure(
    failures,
    measurements.newThermalThrottling === true,
    "The run introduced thermal throttling.",
  );
  addFailure(
    failures,
    !measurements.offlineSucceeded,
    "The offline run did not succeed.",
  );
}

function addFailure(
  failures: string[],
  failed: boolean,
  message: string,
): void {
  if (failed) {
    failures.push(message);
  }
}

function mean(values: readonly number[]): number {
  if (values.length === 0) {
    throw new Error("Cannot calculate a mean from no values.");
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function words(value: string): string[] {
  const normalized = normalizeTranscript(value);
  return normalized === "" ? [] : normalized.split(" ");
}

function editDistance(
  expectedWords: readonly string[],
  actualWords: readonly string[],
): number {
  let previous = Array.from(
    { length: actualWords.length + 1 },
    (_, index) => index,
  );

  for (const [expectedIndex, expectedWord] of expectedWords.entries()) {
    const current = [expectedIndex + 1];

    for (const [actualIndex, actualWord] of actualWords.entries()) {
      const insertion = (current[actualIndex] ?? 0) + 1;
      const deletion = (previous[actualIndex + 1] ?? 0) + 1;
      const substitution =
        (previous[actualIndex] ?? 0) + (expectedWord === actualWord ? 0 : 1);
      current.push(Math.min(insertion, deletion, substitution));
    }

    previous = current;
  }

  return previous[actualWords.length] ?? 0;
}
