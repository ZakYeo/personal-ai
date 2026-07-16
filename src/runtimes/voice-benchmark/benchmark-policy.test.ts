import { readFile } from "node:fs/promises";
import { parseVoiceBenchmarkPolicy } from "./benchmark-policy.js";

describe("voice benchmark policy", () => {
  it("parses the committed desktop benchmark policy", async () => {
    const policy = parseVoiceBenchmarkPolicy(
      JSON.parse(
        await readFile("benchmarks/voice/policy.json", "utf8"),
      ) as unknown,
    );

    expect(policy).toMatchObject({
      minimumPersonalSamples: 22,
      personalExactMatchRate: 0.95,
      referenceWordErrorRate: 0.12,
      schemaVersion: 1,
    });
    expect(policy.devices["desktop-wsl2"]).toEqual({
      sttFinalizationP95Ms: 750,
      sttRealTimeFactorP95: 0.4,
      ttsFirstAudioP95Ms: 400,
      ttsRealTimeFactorP95: 0.25,
    });
    expect(policy.devices.pi5.sttFinalizationP95Ms).toBe(1_500);
  });

  it("rejects unknown fields, invalid rates, and unsupported devices", () => {
    expect(() =>
      parseVoiceBenchmarkPolicy({ ...createPolicy(), extra: true }),
    ).toThrow(/unknown field extra/iu);
    expect(() =>
      parseVoiceBenchmarkPolicy({
        ...createPolicy(),
        personalExactMatchRate: 2,
      }),
    ).toThrow(/personalExactMatchRate/iu);
    expect(() =>
      parseVoiceBenchmarkPolicy({
        ...createPolicy(),
        devices: { laptop: createPolicy().devices["desktop-wsl2"] },
      }),
    ).toThrow(/unknown field laptop/iu);
  });
});

function createPolicy() {
  return {
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
  };
}
