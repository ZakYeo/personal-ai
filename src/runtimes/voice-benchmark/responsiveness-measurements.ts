import {
  requireArray,
  requireNonEmptyString,
  requireRecord,
} from "./structural-parsing.js";

export const responsivenessMetricNames = [
  "wakeToVisibleFeedbackMs",
  "utteranceEndToFirstTranscriptMs",
  "utteranceEndToUsefulAudioMs",
  "recognizedStopToSilenceMs",
  "acousticStopToSilenceMs",
  "softwareStopToCleanupMs",
] as const;
export const responsivenessKinds = ["command", "stop", "barge_in"] as const;
export const responsivenessScenarios = [
  "quiet",
  "background_noise",
  "back_to_back",
] as const;

type MetricName = (typeof responsivenessMetricNames)[number];
type SampleKind = (typeof responsivenessKinds)[number];
type Scenario = (typeof responsivenessScenarios)[number];

interface ResponsivenessSample {
  readonly id: string;
  readonly kind: SampleKind;
  readonly scenario: Scenario;
  readonly success: boolean;
  readonly duplicateActions: number;
  readonly falseWake: boolean;
  readonly measurements: Readonly<Partial<Record<MetricName, number>>>;
}

const setupNames = [
  "hostId",
  "os",
  "microphone",
  "speaker",
  "wakeProvider",
  "sttProvider",
  "intentProvider",
  "ttsProvider",
  "processing",
  "inputIsolation",
] as const;

export function parseResponsivenessMeasurements(value: unknown) {
  const record = exactRecord(value, "responsiveness evidence", [
    "schemaVersion",
    "evidence",
    "setup",
    "samples",
  ]);
  if (record.schemaVersion !== 1)
    throw new Error("Unsupported responsiveness evidence schema.");
  const evidence = enumValue(
    record.evidence,
    ["synthetic", "device"] as const,
    "evidence",
  );
  const rawSetup = exactRecord(record.setup, "setup", setupNames);
  const setup = Object.fromEntries(
    setupNames.map((name) => [name, boundedLabel(rawSetup[name], name)]),
  );
  enumValue(setup.processing, ["local", "mixed", "remote"], "processing");
  enumValue(
    setup.inputIsolation,
    ["headphones", "echo_cancelled", "none"],
    "inputIsolation",
  );
  const inputSamples = requireArray(record.samples, "samples");
  if (inputSamples.length > 3_000)
    throw new Error("Responsiveness evidence is limited to 3000 samples.");
  const identities = new Set<string>();
  const samples = inputSamples.map((sample): ResponsivenessSample => {
    const parsed = exactRecord(sample, "sample", [
      "id",
      "kind",
      "scenario",
      "success",
      "duplicateActions",
      "falseWake",
      "measurements",
    ]);
    const id = boundedLabel(parsed.id, "sample id");
    if (identities.has(id))
      throw new Error("Duplicate responsiveness sample id.");
    identities.add(id);
    const kind = enumValue(parsed.kind, responsivenessKinds, "sample kind");
    const scenario = enumValue(
      parsed.scenario,
      responsivenessScenarios,
      "sample scenario",
    );
    if (
      typeof parsed.success !== "boolean" ||
      typeof parsed.falseWake !== "boolean"
    )
      throw new Error(
        "Sample success and falseWake must be explicit booleans.",
      );
    if (
      typeof parsed.duplicateActions !== "number" ||
      !Number.isSafeInteger(parsed.duplicateActions) ||
      parsed.duplicateActions < 0 ||
      parsed.duplicateActions > 100
    )
      throw new Error(
        "Sample duplicateActions must be an integer from 0 to 100.",
      );
    const inputMetrics = exactRecord(
      parsed.measurements,
      "sample measurements",
      responsivenessMetricNames,
    );
    const measurements: Partial<Record<MetricName, number>> = {};
    for (const name of responsivenessMetricNames) {
      const duration = inputMetrics[name];
      if (duration === undefined) continue;
      if (
        typeof duration !== "number" ||
        !Number.isFinite(duration) ||
        duration > 600_000 ||
        duration < (name === "utteranceEndToFirstTranscriptMs" ? -600_000 : 0)
      )
        throw new Error(
          "Responsiveness duration is outside its finite measurement bounds.",
        );
      const commandMetric = [
        "wakeToVisibleFeedbackMs",
        "utteranceEndToFirstTranscriptMs",
        "utteranceEndToUsefulAudioMs",
      ].includes(name);
      if (commandMetric !== (kind === "command"))
        throw new Error(
          "Responsiveness metric does not match its sample kind.",
        );
      measurements[name] = duration;
    }
    return Object.freeze({
      id,
      kind,
      scenario,
      success: parsed.success,
      duplicateActions: parsed.duplicateActions,
      falseWake: parsed.falseWake,
      measurements: Object.freeze(measurements),
    });
  });
  return Object.freeze({
    schemaVersion: 1 as const,
    evidence,
    setup: Object.freeze(setup),
    samples: Object.freeze(samples),
  });
}

function exactRecord(
  value: unknown,
  label: string,
  allowed: readonly string[],
): Record<string, unknown> {
  const record = requireRecord(value, label);
  if (Object.keys(record).some((name) => !allowed.includes(name)))
    throw new Error(`${label} contains undeclared fields.`);
  return record;
}

function boundedLabel(value: unknown, label: string): string {
  const result = requireNonEmptyString(value, label);
  if (result.length > 128 || /[\p{Cc}\p{Zl}\p{Zp}]/u.test(result))
    throw new Error(`${label} must be a bounded single-line label.`);
  return result;
}

function enumValue<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  label: string,
): T[number] {
  if (typeof value !== "string" || !allowed.includes(value))
    throw new Error(`Invalid ${label}.`);
  return value;
}
