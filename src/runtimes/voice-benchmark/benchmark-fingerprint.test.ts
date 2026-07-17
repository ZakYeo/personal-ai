import {
  calculateVoiceBenchmarkFingerprint,
  requireVoiceBenchmarkFingerprint,
  type VoiceBenchmarkInputContents,
} from "./benchmark-fingerprint.js";

describe("voice benchmark input fingerprint", () => {
  it("changes for stale policy, candidate, and artifact inputs", () => {
    const current = createContents();
    const fingerprint = calculateVoiceBenchmarkFingerprint(current);

    for (const field of [
      "policyContents",
      "candidateContents",
      "artifactContents",
    ] as const) {
      const changed = calculateVoiceBenchmarkFingerprint({
        ...current,
        [field]: `${current[field]} changed`,
      });
      expect(changed).not.toBe(fingerprint);
      expect(() =>
        requireVoiceBenchmarkFingerprint(fingerprint, changed),
      ).toThrow(/fingerprint/iu);
    }
  });
});

function createContents(): VoiceBenchmarkInputContents {
  return {
    artifactContents: "artifacts",
    candidateContents: "candidates",
    policyContents: "policy",
    recordingContents: "recordings",
    ttsContents: "tts",
  };
}
