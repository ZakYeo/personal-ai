import { buildVoiceResponsivenessReport } from "./responsiveness-report.js";

function measurements(evidence = "device") {
  return {
    schemaVersion: 1,
    evidence,
    setup: {
      hostId: "desktop-1",
      os: "Linux",
      microphone: "test microphone",
      speaker: "headphones",
      wakeProvider: "local",
      sttProvider: "remote",
      intentProvider: "local",
      ttsProvider: "local",
      processing: "mixed",
      inputIsolation: "headphones",
    },
    samples: Array.from({ length: 90 }, (_, index) => ({
      id: `sample-${index}`,
      kind: index < 30 ? "command" : index < 60 ? "stop" : "barge_in",
      scenario: ["quiet", "background_noise", "back_to_back"][index % 3],
      success: true,
      duplicateActions: 0,
      falseWake: false,
      measurements:
        index < 30
          ? {
              wakeToVisibleFeedbackMs: 50,
              utteranceEndToFirstTranscriptMs: -20,
              utteranceEndToUsefulAudioMs: 1_000,
            }
          : {
              recognizedStopToSilenceMs: 150,
              acousticStopToSilenceMs: 250,
              softwareStopToCleanupMs: 100,
            },
    })),
  };
}

describe("voice responsiveness evidence report", () => {
  it("reports nearest-rank percentiles, sample counts, and distinct acoustic and software intervals", () => {
    const report = buildVoiceResponsivenessReport(measurements());
    expect(report.acceptance).toBe("passed");
    expect(report.metrics.utteranceEndToUsefulAudioMs).toMatchObject({
      samples: 30,
      p50: 1_000,
      p95: 1_000,
    });
    expect(report.metrics.utteranceEndToFirstTranscriptMs).toMatchObject({
      p50: -20,
    });
    expect(report.metrics.acousticStopToSilenceMs?.p95).toBe(250);
    expect(report.metrics.softwareStopToCleanupMs?.p95).toBe(100);
  });
  it("never accepts synthetic fixtures as device evidence", () => {
    expect(
      buildVoiceResponsivenessReport(measurements("synthetic")).acceptance,
    ).toBe("incomplete");
  });
  it("does not substitute software cleanup for unmeasured acoustic silence", () => {
    const input = measurements();
    for (const sample of input.samples)
      delete sample.measurements.recognizedStopToSilenceMs;
    const report = buildVoiceResponsivenessReport(input);
    expect(report.acceptance).toBe("incomplete");
    expect(report.metrics.recognizedStopToSilenceMs).toBeNull();
  });
  it("fails exact threshold values and records failed or duplicate actions", () => {
    const input = measurements();
    input.samples[0]!.measurements.wakeToVisibleFeedbackMs = 150;
    input.samples[1]!.success = false;
    input.samples[2]!.duplicateActions = 1;
    const report = buildVoiceResponsivenessReport(input);
    expect(report.acceptance).toBe("failed");
    expect(report.failures).toEqual(
      expect.arrayContaining([
        "wakeToVisibleFeedbackMs exceeded its target",
        "One or more samples failed",
        "Duplicate actions were observed",
      ]),
    );
  });
  it("rejects undeclared content and duplicate sample identities", () => {
    const input = measurements();
    expect(() =>
      buildVoiceResponsivenessReport({
        ...input,
        transcript: "private content",
      }),
    ).toThrow();
    input.samples[1]!.id = input.samples[0]!.id;
    expect(() => buildVoiceResponsivenessReport(input)).toThrow();
  });
  it.each([NaN, Infinity, -1, 600_001])(
    "rejects invalid unsigned durations: %s",
    (duration) => {
      const input = measurements();
      input.samples[0]!.measurements.wakeToVisibleFeedbackMs = duration;
      expect(() => buildVoiceResponsivenessReport(input)).toThrow();
    },
  );
});
