import {
  requireNonEmptyString as requireString,
  requireRecord,
  requireSha256Digest as requireDigest,
} from "./structural-parsing.js";

export interface AggregatedCandidate {
  candidateId: string;
  kind: "stt" | "tts";
  samples: Array<Record<string, unknown>>;
}

export interface AggregatedBenchmark {
  candidates: AggregatedCandidate[];
  corpusSha256: string;
  device: Record<string, unknown>;
  repetitions: 3;
  schemaVersion: 1;
  startedAt: string;
  warmupRepetitions: 1;
}

export interface BenchmarkAggregationExpectation {
  candidates: ReadonlyArray<{
    candidateId: string;
    kind: "stt" | "tts";
    sampleIds: readonly string[];
  }>;
  deviceId: string;
  fingerprint: string;
}

type ParsedChunk = AggregatedBenchmark;

export function aggregateBenchmarkChunks(
  chunks: readonly unknown[],
  expectation: BenchmarkAggregationExpectation,
): AggregatedBenchmark {
  if (chunks.length === 0)
    throw new Error("Benchmark chunks must be nonempty.");
  const parsed = chunks.map((chunk, index) =>
    parseBenchmarkResult(chunk, `chunks[${index}]`),
  );
  const first = parsed[0]!;
  if (first.corpusSha256 !== expectation.fingerprint) {
    throw new Error(
      "Benchmark chunks do not match the current input fingerprint.",
    );
  }
  if (first.device.deviceId !== expectation.deviceId) {
    throw new Error(`Benchmark device must be ${expectation.deviceId}.`);
  }
  const deviceSnapshot = stableDeviceIdentity(first.device);
  const expectedCandidates = new Map(
    expectation.candidates.map((candidate) => [
      candidate.candidateId,
      candidate,
    ]),
  );
  const byCandidate = new Map<string, AggregatedCandidate>();

  for (const chunk of parsed) {
    if (chunk.corpusSha256 !== first.corpusSha256)
      throw new Error("Benchmark corpus hashes differ.");
    if (stableDeviceIdentity(chunk.device) !== deviceSnapshot)
      throw new Error("Benchmark device snapshots differ.");
    if (chunk.candidates.length !== 1)
      throw new Error("Each benchmark chunk must contain one candidate.");
    const candidate = chunk.candidates[0]!;
    const expected = expectedCandidates.get(candidate.candidateId);
    if (!expected || expected.kind !== candidate.kind) {
      throw new Error(
        `Unexpected benchmark candidate ${candidate.candidateId}.`,
      );
    }
    const target = byCandidate.get(candidate.candidateId) ?? {
      candidateId: candidate.candidateId,
      kind: candidate.kind,
      samples: [],
    };
    for (const sample of candidate.samples) {
      const id = requireString(sample.id, "sample.id");
      if (target.samples.some((existing) => existing.id === id)) {
        throw new Error(
          `Candidate ${candidate.candidateId} contains duplicate sample ${id}.`,
        );
      }
      target.samples.push(sample);
    }
    byCandidate.set(candidate.candidateId, target);
  }

  for (const expected of expectation.candidates) {
    const actual = byCandidate.get(expected.candidateId);
    const actualIds = new Set(
      actual?.samples.map((sample) => String(sample.id)) ?? [],
    );
    if (
      !actual ||
      actual.kind !== expected.kind ||
      actualIds.size !== expected.sampleIds.length ||
      expected.sampleIds.some((id) => !actualIds.has(id))
    ) {
      throw new Error(
        `Benchmark coverage is incomplete for ${expected.candidateId}.`,
      );
    }
  }

  return {
    candidates: [...byCandidate.values()].sort((a, b) =>
      a.candidateId.localeCompare(b.candidateId),
    ),
    corpusSha256: first.corpusSha256,
    device: first.device,
    repetitions: 3,
    schemaVersion: 1,
    startedAt: parsed.map(({ startedAt }) => startedAt).sort()[0]!,
    warmupRepetitions: 1,
  };
}

function stableDeviceIdentity(device: Record<string, unknown>): string {
  return JSON.stringify({
    architecture: requireString(device.architecture, "device.architecture"),
    cpu: requireString(device.cpu, "device.cpu"),
    deviceId: requireString(device.deviceId, "device.deviceId"),
    kernel: requireString(device.kernel, "device.kernel"),
    os: requireString(device.os, "device.os"),
  });
}

export function parseBenchmarkResult(
  value: unknown,
  label = "benchmark result",
): ParsedChunk {
  const record = requireRecord(value, label);
  if (
    record.schemaVersion !== 1 ||
    record.repetitions !== 3 ||
    record.warmupRepetitions !== 1
  ) {
    throw new Error(`${label} has unsupported benchmark metadata.`);
  }
  if (!Array.isArray(record.candidates) || record.candidates.length === 0) {
    throw new Error(`${label}.candidates must be nonempty.`);
  }
  const candidates = record.candidates.map((value, candidateIndex) => {
    const candidate = requireRecord(
      value,
      `${label}.candidates[${candidateIndex}]`,
    );
    const kind = candidate.kind;
    if (kind !== "stt" && kind !== "tts")
      throw new Error("Candidate kind must be stt or tts.");
    if (!Array.isArray(candidate.samples) || candidate.samples.length === 0) {
      throw new Error("Candidate samples must be nonempty.");
    }
    const samples = candidate.samples.map((value, sampleIndex) => {
      const sample = requireRecord(value, `${label}.samples[${sampleIndex}]`);
      requireString(sample.id, "sample.id");
      if (
        !Array.isArray(sample.repetitions) ||
        sample.repetitions.length !== 3
      ) {
        throw new Error("Every sample must contain exactly 3 repetitions.");
      }
      sample.repetitions.forEach((repetition, repetitionIndex) =>
        validateRepetition(
          requireRecord(repetition, `sample.repetitions[${repetitionIndex}]`),
          kind,
        ),
      );
      validateSample(sample, kind);
      return sample;
    });
    const parsedCandidate: AggregatedCandidate = {
      candidateId: requireString(candidate.candidateId, "candidateId"),
      kind,
      samples,
    };
    return parsedCandidate;
  });
  const device = requireRecord(record.device, `${label}.device`);
  requireString(device.deviceId, `${label}.device.deviceId`);
  return {
    candidates,
    corpusSha256: requireDigest(record.corpusSha256, `${label}.corpusSha256`),
    device,
    repetitions: 3,
    schemaVersion: 1,
    startedAt: requireString(record.startedAt, `${label}.startedAt`),
    warmupRepetitions: 1,
  };
}

function validateSample(
  sample: Record<string, unknown>,
  kind: "stt" | "tts",
): void {
  if (kind === "stt") {
    requireNonnegativeNumber(sample.audioDurationMs, "sample.audioDurationMs");
    requireString(sample.expectedText, "sample.expectedText");
    if (sample.inputKind !== "personal" && sample.inputKind !== "reference") {
      throw new Error("sample.inputKind must be personal or reference.");
    }
    requireNonnegativeNumber(sample.speechEndMs, "sample.speechEndMs");
    if (typeof sample.exactMatch !== "boolean") {
      throw new Error("sample.exactMatch must be boolean.");
    }
    if (sample.wordErrorRate !== null) {
      requireNonnegativeNumber(sample.wordErrorRate, "sample.wordErrorRate");
    }
    return;
  }
  requireString(sample.text, "sample.text");
  if (
    !Array.isArray(sample.expectedFacts) ||
    sample.expectedFacts.some((fact) => typeof fact !== "string")
  ) {
    throw new Error("sample.expectedFacts must be a string array.");
  }
}

function validateRepetition(
  repetition: Record<string, unknown>,
  kind: "stt" | "tts",
): void {
  if (repetition.ok === false) {
    requireString(repetition.diagnostic, "repetition.diagnostic");
    if (repetition.errorCategory !== "execution") {
      throw new Error("Failed repetition errorCategory must be execution.");
    }
    return;
  }
  if (repetition.ok !== true) throw new Error("repetition.ok must be boolean.");
  for (const field of ["cpuMs", "peakRssBytes", "realTimeFactor"] as const) {
    requireNonnegativeNumber(repetition[field], `repetition.${field}`);
  }
  for (const field of ["shutdownMs", "startupMs"] as const) {
    if (repetition[field] !== null) {
      requireNonnegativeNumber(repetition[field], `repetition.${field}`);
    }
  }
  if (kind === "stt") {
    requireNonnegativeNumber(
      repetition.finalizationMs,
      "repetition.finalizationMs",
    );
    requireString(repetition.transcript, "repetition.transcript");
    requireNonnegativeNumber(
      repetition.wordErrorRate,
      "repetition.wordErrorRate",
    );
    if (typeof repetition.exactMatch !== "boolean") {
      throw new Error("repetition.exactMatch must be boolean.");
    }
    return;
  }
  requireNonnegativeNumber(
    repetition.audioDurationMs,
    "repetition.audioDurationMs",
  );
  requireNonnegativeNumber(repetition.firstAudioMs, "repetition.firstAudioMs");
  const digest = requireString(
    repetition.audioSha256,
    "repetition.audioSha256",
  );
  if (!/^[a-f\d]{64}$/u.test(digest)) {
    throw new Error("repetition.audioSha256 must be a SHA-256 digest.");
  }
}

function requireNonnegativeNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a nonnegative number.`);
  }
  return value;
}
