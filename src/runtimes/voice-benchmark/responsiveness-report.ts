import { percentile } from "./benchmark-metrics.js";
import {
  parseResponsivenessMeasurements,
  responsivenessKinds,
  responsivenessMetricNames,
  responsivenessScenarios,
} from "./responsiveness-measurements.js";

type MetricName = (typeof responsivenessMetricNames)[number];

interface MetricSummary {
  samples: number;
  p50: number;
  p95: number;
  maximum: number;
}

export function buildVoiceResponsivenessReport(value: unknown) {
  const input = parseResponsivenessMeasurements(value);
  const failures: string[] = [];
  const missing: string[] = [];
  if (input.evidence !== "device")
    missing.push("Synthetic evidence cannot establish device acceptance");
  const metrics = Object.fromEntries(
    responsivenessMetricNames.map((name) => {
      const values = input.samples.flatMap((sample) =>
        sample.measurements[name] === undefined
          ? []
          : [sample.measurements[name]],
      );
      return [
        name,
        values.length
          ? {
              samples: values.length,
              p50: percentile(values, 0.5),
              p95: percentile(values, 0.95),
              maximum: Math.max(...values),
            }
          : null,
      ];
    }),
  ) as Record<MetricName, MetricSummary | null>;
  const coverage = responsivenessKinds.map((kind) => {
    const samples = input.samples.filter((sample) => sample.kind === kind);
    if (samples.length < 30) missing.push(`${kind} needs at least 30 samples`);
    const scenarios = Object.fromEntries(
      responsivenessScenarios.map((scenario) => {
        const count = samples.filter(
          (sample) => sample.scenario === scenario,
        ).length;
        if (!count) missing.push(`${kind} needs ${scenario} coverage`);
        return [scenario, count];
      }),
    );
    const required: readonly MetricName[] =
      kind === "command"
        ? [
            "wakeToVisibleFeedbackMs",
            "utteranceEndToFirstTranscriptMs",
            "utteranceEndToUsefulAudioMs",
          ]
        : ["recognizedStopToSilenceMs", "acousticStopToSilenceMs"];
    for (const name of required) {
      if (
        samples.filter((sample) => sample.measurements[name] !== undefined)
          .length < 30
      )
        missing.push(`${kind} needs 30 measured ${name} values`);
    }
    return { kind, samples: samples.length, scenarios };
  });
  const failedSamples = input.samples.filter(
    (sample) => !sample.success,
  ).length;
  const duplicateActions = input.samples.reduce(
    (sum, sample) => sum + sample.duplicateActions,
    0,
  );
  const falseWakes = input.samples.filter((sample) => sample.falseWake).length;
  if (failedSamples) failures.push("One or more samples failed");
  if (duplicateActions) failures.push("Duplicate actions were observed");
  if (falseWakes) failures.push("False wakes were observed");
  for (const { name, statistic, threshold } of [
    { name: "wakeToVisibleFeedbackMs", statistic: "maximum", threshold: 150 },
    { name: "recognizedStopToSilenceMs", statistic: "maximum", threshold: 300 },
    { name: "utteranceEndToUsefulAudioMs", statistic: "p95", threshold: 1_500 },
  ] as const) {
    const measured = metrics[name];
    if (measured && measured[statistic] >= threshold)
      failures.push(`${name} exceeded its target`);
  }
  return {
    schemaVersion: 1,
    evidence: input.evidence,
    setup: input.setup,
    acceptance: failures.length
      ? "failed"
      : missing.length
        ? "incomplete"
        : "passed",
    coverage,
    metrics,
    failedSamples,
    duplicateActions,
    falseWakes,
    failures,
    missing,
    measurementNotice:
      "Operator-supplied acoustic measurements are separate from software cleanup. This report does not independently verify the recording method or prove broader daily-use acceptance.",
  };
}
