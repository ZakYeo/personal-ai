import {
  calculateWordErrorRate,
  evaluateSttMeasurements,
  evaluateTtsMeasurements,
  normalizeTranscript,
  percentile,
  selectDesktopWinner,
  selectPiSafeWinner,
} from "./benchmark-metrics.js";
import { parseVoiceBenchmarkPolicy } from "./benchmark-policy.js";

describe("voice benchmark metrics", () => {
  it("normalizes provider punctuation, case, and whitespace", () => {
    expect(normalizeTranscript("  Set an ALARM, for 7:30!  ")).toBe(
      "set an alarm for 7 30",
    );
  });

  it("calculates word error rate with insertions, deletions, and substitutions", () => {
    expect(
      calculateWordErrorRate("set an alarm for seven", "set alarm at eight"),
    ).toBe(0.6);
    expect(calculateWordErrorRate("", "unexpected words")).toBe(2);
    expect(calculateWordErrorRate("", "")).toBe(0);
  });

  it("uses the nearest-rank percentile", () => {
    expect(percentile([10, 30, 20, 40], 0.5)).toBe(20);
    expect(percentile([10, 30, 20, 40], 0.95)).toBe(40);
  });

  it("applies every balanced STT gate for the selected device", () => {
    const result = evaluateSttMeasurements(
      {
        commandMatches: Array.from({ length: 22 }, () => true),
        device: "pi5",
        finalizationMs: [700, 900, 1_200],
        installBytes: 800_000_000,
        offlineSucceeded: true,
        peakRssBytes: 900_000_000,
        referenceWordErrorRates: [0.08, 0.1, 0.12],
        realTimeFactors: [0.4, 0.5, 0.7],
        shutdownMs: 300,
        startupMs: 2_000,
        newThermalThrottling: "unavailable",
      },
      createPolicy(),
    );

    expect(result).toEqual({ failures: [], passed: true });
  });

  it("reports each failed STT gate without short-circuiting", () => {
    const result = evaluateSttMeasurements(
      {
        commandMatches: Array.from({ length: 24 }, () => false),
        device: "desktop-wsl2",
        finalizationMs: [900],
        installBytes: 1_100_000_000,
        newThermalThrottling: true,
        offlineSucceeded: false,
        peakRssBytes: 1_700_000_000,
        referenceWordErrorRates: [0.2],
        realTimeFactors: [0.5],
        shutdownMs: 2_100,
        startupMs: 5_100,
      },
      createPolicy(),
    );

    expect(result.passed).toBe(false);
    expect(result.failures).toHaveLength(10);
  });

  it("applies correctness, listening, and performance TTS gates", () => {
    expect(
      evaluateTtsMeasurements(
        {
          device: "pi5",
          firstAudioMs: [300, 450, 700],
          installBytes: 400_000_000,
          intelligibilityRatings: [4, 4, 5],
          materialFactErrors: 0,
          naturalnessRatings: [3, 4, 4],
          newThermalThrottling: false,
          offlineSucceeded: true,
          peakRssBytes: 500_000_000,
          realTimeFactors: [0.2, 0.3, 0.45],
          shutdownMs: 200,
          startupMs: 1_000,
        },
        createPolicy(),
      ),
    ).toEqual({ failures: [], passed: true });
  });

  it("selects one winner that passes both devices and uses Pi metrics for ties", () => {
    expect(
      selectPiSafeWinner([
        {
          candidateId: "candidate-a",
          desktopPassed: true,
          pi: {
            correctness: 0.98,
            installBytes: 500,
            latencyMs: 500,
            peakRssBytes: 400,
            realTimeFactor: 0.4,
          },
          piPassed: true,
        },
        {
          candidateId: "candidate-b",
          desktopPassed: true,
          pi: {
            correctness: 0.99,
            installBytes: 700,
            latencyMs: 700,
            peakRssBytes: 600,
            realTimeFactor: 0.5,
          },
          piPassed: true,
        },
        {
          candidateId: "desktop-only",
          desktopPassed: true,
          pi: {
            correctness: 1,
            installBytes: 1,
            latencyMs: 1,
            peakRssBytes: 1,
            realTimeFactor: 0.1,
          },
          piPassed: false,
        },
      ]),
    ).toBe("candidate-b");
  });

  it("returns a no-go when no candidate passes both devices", () => {
    expect(
      selectPiSafeWinner([
        {
          candidateId: "candidate-a",
          desktopPassed: true,
          pi: {
            correctness: 1,
            installBytes: 1,
            latencyMs: 1,
            peakRssBytes: 1,
            realTimeFactor: 0.1,
          },
          piPassed: false,
        },
      ]),
    ).toBeNull();
  });

  it("selects only passing desktop candidates with deterministic tie-breaks", () => {
    expect(
      selectDesktopWinner([
        createDesktopCandidate("slower", 0.98, 500),
        createDesktopCandidate("accurate", 0.99, 700),
        { ...createDesktopCandidate("failed", 1, 1), passed: false },
      ]),
    ).toBe("accurate");
    expect(
      selectDesktopWinner([
        { ...createDesktopCandidate("b", 0.99, 500), quality: 4 },
        { ...createDesktopCandidate("a", 0.99, 500), quality: 4 },
      ]),
    ).toBe("a");
    expect(
      selectDesktopWinner([
        { ...createDesktopCandidate("failed", 1, 1), passed: false },
      ]),
    ).toBeNull();
  });
});

function createDesktopCandidate(
  candidateId: string,
  correctness: number,
  latencyMs: number,
) {
  return {
    candidateId,
    correctness,
    installBytes: 500,
    latencyMs,
    passed: true,
    peakRssBytes: 400,
    quality: 0,
    realTimeFactor: 0.4,
  };
}

function createPolicy() {
  return parseVoiceBenchmarkPolicy({
    devices: {
      "desktop-wsl2": {
        sttFinalizationP95Ms: 750,
        sttRealTimeFactorP95: 0.4,
        ttsFirstAudioP95Ms: 400,
        ttsRealTimeFactorP95: 0.25,
      },
      pi5: {
        sttFinalizationP95Ms: 1_500,
        sttRealTimeFactorP95: 0.75,
        ttsFirstAudioP95Ms: 750,
        ttsRealTimeFactorP95: 0.5,
      },
    },
    installBytesMaximum: 1_073_741_824,
    minimumPersonalSamples: 22,
    peakRssBytesMaximum: 1_610_612_736,
    personalExactMatchRate: 0.95,
    referenceWordErrorRate: 0.12,
    schemaVersion: 1,
    shutdownMaximumMs: 2_000,
    startupMaximumMs: 5_000,
    ttsIntelligibilityMean: 4,
    ttsNaturalnessMean: 3.5,
  });
}
