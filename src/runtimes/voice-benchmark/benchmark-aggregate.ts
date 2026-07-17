interface AggregatedCandidate {
  candidateId: string;
  kind: "stt" | "tts";
  samples: Array<Record<string, unknown>>;
}

interface AggregatedBenchmark {
  candidates: AggregatedCandidate[];
  corpusSha256: string;
  device: Record<string, unknown>;
  repetitions: 3;
  schemaVersion: 1;
  startedAt: string;
  warmupRepetitions: 1;
}

export function aggregateBenchmarkChunks(
  chunks: readonly unknown[],
): AggregatedBenchmark {
  if (chunks.length === 0)
    throw new Error("Benchmark chunks must be nonempty.");
  const parsed = chunks.map((chunk, index) =>
    requireRecord(chunk, `chunks[${index}]`),
  );
  const first = parsed[0]!;
  const corpusSha256 = requireString(first.corpusSha256, "corpusSha256");
  const byCandidate = new Map<string, AggregatedCandidate>();
  for (const [chunkIndex, chunk] of parsed.entries()) {
    if (
      chunk.schemaVersion !== 1 ||
      chunk.repetitions !== 3 ||
      chunk.warmupRepetitions !== 1
    ) {
      throw new Error(
        `chunks[${chunkIndex}] has unsupported benchmark metadata.`,
      );
    }
    if (chunk.corpusSha256 !== corpusSha256)
      throw new Error("Benchmark corpus hashes differ.");
    if (!Array.isArray(chunk.candidates) || chunk.candidates.length !== 1) {
      throw new Error(`chunks[${chunkIndex}] must contain one candidate.`);
    }
    const candidate = requireRecord(
      chunk.candidates[0],
      `chunks[${chunkIndex}].candidate`,
    );
    const candidateId = requireString(candidate.candidateId, "candidateId");
    const kind = candidate.kind;
    if (kind !== "stt" && kind !== "tts")
      throw new Error("Candidate kind must be stt or tts.");
    if (!Array.isArray(candidate.samples))
      throw new Error("Candidate samples must be an array.");
    const target = byCandidate.get(candidateId) ?? {
      candidateId,
      kind,
      samples: [],
    };
    for (const sampleValue of candidate.samples) {
      const sample = requireRecord(sampleValue, "sample");
      const id = requireString(sample.id, "sample.id");
      if (target.samples.some((existing) => existing.id === id)) {
        throw new Error(
          `Candidate ${candidateId} contains duplicate sample ${id}.`,
        );
      }
      target.samples.push(sample);
    }
    byCandidate.set(candidateId, target);
  }
  return {
    candidates: [...byCandidate.values()].sort((a, b) =>
      a.candidateId.localeCompare(b.candidateId),
    ),
    corpusSha256,
    device: requireRecord(first.device, "device"),
    repetitions: 3,
    schemaVersion: 1,
    startedAt: parsed
      .map((chunk) => requireString(chunk.startedAt, "startedAt"))
      .sort()[0]!,
    warmupRepetitions: 1,
  };
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value === "")
    throw new Error(`${label} must be a nonempty string.`);
  return value;
}
