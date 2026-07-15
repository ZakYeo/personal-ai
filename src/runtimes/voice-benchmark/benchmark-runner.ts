import {
  calculateWordErrorRate,
  normalizeTranscript,
} from "./benchmark-metrics.js";

interface BenchmarkDeviceSnapshot {
  architecture: string;
  cpu: string;
  deviceId: "desktop-wsl2" | "pi5";
  kernel: string;
  memoryBytes: number;
  os: string;
}

interface SttBenchmarkInput {
  audioDurationMs: number;
  expectedText: string;
  filePath: string;
  id: string;
  kind: "personal" | "reference";
  speechEndMs: number;
}

interface TtsBenchmarkInput {
  expectedFacts: string[];
  id: string;
  text: string;
}

interface VoiceBenchmarkRequest {
  corpusSha256: string;
  device: BenchmarkDeviceSnapshot;
  startedAt: string;
  sttCandidates: string[];
  sttInputs: SttBenchmarkInput[];
  ttsCandidates: string[];
  ttsInputs: TtsBenchmarkInput[];
}

interface SharedExecutionTelemetry {
  cpuMs: number;
  peakRssBytes: number;
  realTimeFactor: number;
  shutdownMs: number;
  startupMs: number;
}

export interface SttExecutionTelemetry extends SharedExecutionTelemetry {
  finalizationMs: number;
  transcript: string;
}

export interface TtsExecutionTelemetry extends SharedExecutionTelemetry {
  audioDurationMs: number;
  audioSha256: string;
  firstAudioMs: number;
}

interface SttExecutionRequest {
  candidateId: string;
  input: SttBenchmarkInput;
  measured: boolean;
  repetition: number;
}

interface TtsExecutionRequest {
  candidateId: string;
  input: TtsBenchmarkInput;
  measured: boolean;
  repetition: number;
  text: string;
}

interface VoiceBenchmarkDependencies {
  executeStt(input: SttExecutionRequest): Promise<SttExecutionTelemetry>;
  executeTts(input: TtsExecutionRequest): Promise<TtsExecutionTelemetry>;
}

interface FailedRepetition {
  diagnostic: string;
  errorCategory: "execution";
  ok: false;
}

interface SuccessfulSttRepetition extends SttExecutionTelemetry {
  exactMatch: boolean;
  ok: true;
  wordErrorRate: number;
}

interface SuccessfulTtsRepetition extends TtsExecutionTelemetry {
  ok: true;
}

type SttRepetition = FailedRepetition | SuccessfulSttRepetition;
type TtsRepetition = FailedRepetition | SuccessfulTtsRepetition;

interface SttSampleResult {
  audioDurationMs: number;
  exactMatch: boolean;
  expectedText: string;
  id: string;
  inputKind: SttBenchmarkInput["kind"];
  repetitions: SttRepetition[];
  speechEndMs: number;
  wordErrorRate: number | null;
}

interface TtsSampleResult {
  expectedFacts: string[];
  id: string;
  repetitions: TtsRepetition[];
  text: string;
}

interface CandidateResult<TSample> {
  candidateId: string;
  kind: "stt" | "tts";
  samples: TSample[];
}

interface VoiceBenchmarkResult {
  candidates: Array<
    CandidateResult<SttSampleResult> | CandidateResult<TtsSampleResult>
  >;
  corpusSha256: string;
  device: BenchmarkDeviceSnapshot;
  repetitions: 3;
  schemaVersion: 1;
  startedAt: string;
  warmupRepetitions: 1;
}

const measuredRepetitions = 3;

export async function runVoiceBenchmark(
  request: VoiceBenchmarkRequest,
  dependencies: VoiceBenchmarkDependencies,
): Promise<VoiceBenchmarkResult> {
  const candidates: VoiceBenchmarkResult["candidates"] = [];

  for (const candidateId of request.sttCandidates) {
    const warmupInput = request.sttInputs[0];
    if (warmupInput) {
      await ignoreWarmupFailure(() =>
        dependencies.executeStt({
          candidateId,
          input: warmupInput,
          measured: false,
          repetition: 0,
        }),
      );
    }

    const samples: SttSampleResult[] = [];
    for (const input of request.sttInputs) {
      samples.push(await runSttSample(candidateId, input, dependencies));
    }
    candidates.push({ candidateId, kind: "stt", samples });
  }

  for (const candidateId of request.ttsCandidates) {
    const warmupInput = request.ttsInputs[0];
    if (warmupInput) {
      await ignoreWarmupFailure(() =>
        dependencies.executeTts({
          candidateId,
          input: warmupInput,
          measured: false,
          repetition: 0,
          text: warmupInput.text,
        }),
      );
    }

    const samples: TtsSampleResult[] = [];
    for (const input of request.ttsInputs) {
      samples.push(await runTtsSample(candidateId, input, dependencies));
    }
    candidates.push({ candidateId, kind: "tts", samples });
  }

  return {
    candidates,
    corpusSha256: request.corpusSha256,
    device: request.device,
    repetitions: 3,
    schemaVersion: 1,
    startedAt: request.startedAt,
    warmupRepetitions: 1,
  };
}

async function runSttSample(
  candidateId: string,
  input: SttBenchmarkInput,
  dependencies: VoiceBenchmarkDependencies,
): Promise<SttSampleResult> {
  const repetitions: SttRepetition[] = [];
  for (let repetition = 1; repetition <= measuredRepetitions; repetition += 1) {
    try {
      const telemetry = await dependencies.executeStt({
        candidateId,
        input,
        measured: true,
        repetition,
      });
      const wordErrorRate = calculateWordErrorRate(
        input.expectedText,
        telemetry.transcript,
      );
      repetitions.push({
        ...telemetry,
        exactMatch:
          normalizeTranscript(input.expectedText) ===
          normalizeTranscript(telemetry.transcript),
        ok: true,
        wordErrorRate,
      });
    } catch (error) {
      repetitions.push(createFailedRepetition(error));
    }
  }

  const successful = repetitions.filter(
    (repetition): repetition is SuccessfulSttRepetition => repetition.ok,
  );
  return {
    audioDurationMs: input.audioDurationMs,
    exactMatch:
      successful.length === measuredRepetitions &&
      successful.every((repetition) => repetition.exactMatch),
    expectedText: input.expectedText,
    id: input.id,
    inputKind: input.kind,
    repetitions,
    speechEndMs: input.speechEndMs,
    wordErrorRate:
      successful.length === 0
        ? null
        : successful.reduce(
            (total, repetition) => total + repetition.wordErrorRate,
            0,
          ) / successful.length,
  };
}

async function runTtsSample(
  candidateId: string,
  input: TtsBenchmarkInput,
  dependencies: VoiceBenchmarkDependencies,
): Promise<TtsSampleResult> {
  const repetitions: TtsRepetition[] = [];
  for (let repetition = 1; repetition <= measuredRepetitions; repetition += 1) {
    try {
      repetitions.push({
        ...(await dependencies.executeTts({
          candidateId,
          input,
          measured: true,
          repetition,
          text: input.text,
        })),
        ok: true,
      });
    } catch (error) {
      repetitions.push(createFailedRepetition(error));
    }
  }

  return {
    expectedFacts: [...input.expectedFacts],
    id: input.id,
    repetitions,
    text: input.text,
  };
}

function createFailedRepetition(error: unknown): FailedRepetition {
  return {
    diagnostic: error instanceof Error ? error.message : String(error),
    errorCategory: "execution",
    ok: false,
  };
}

async function ignoreWarmupFailure(operation: () => Promise<unknown>) {
  try {
    await operation();
  } catch {
    // A measured repetition records the reproducible diagnostic.
  }
}
