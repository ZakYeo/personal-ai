import { requirePositiveInteger, requireRecord } from "./structural-parsing.js";

export interface VoiceBenchmarkPolicy {
  devices: Readonly<
    Record<
      "desktop-wsl2" | "pi5",
      Readonly<{
        sttFinalizationP95Ms: number;
        sttRealTimeFactorP95: number;
        ttsFirstAudioP95Ms: number;
        ttsRealTimeFactorP95: number;
      }>
    >
  >;
  installBytesMaximum: number;
  minimumPersonalSamples: number;
  peakRssBytesMaximum: number;
  personalExactMatchRate: number;
  referenceWordErrorRate: number;
  schemaVersion: 1;
  shutdownMaximumMs: number;
  startupMaximumMs: number;
  ttsIntelligibilityMean: number;
  ttsNaturalnessMean: number;
}

const rootFields = new Set([
  "devices",
  "installBytesMaximum",
  "minimumPersonalSamples",
  "peakRssBytesMaximum",
  "personalExactMatchRate",
  "referenceWordErrorRate",
  "schemaVersion",
  "shutdownMaximumMs",
  "startupMaximumMs",
  "ttsIntelligibilityMean",
  "ttsNaturalnessMean",
]);

export function parseVoiceBenchmarkPolicy(
  input: unknown,
): VoiceBenchmarkPolicy {
  const record = requireRecord(input, "benchmark policy");
  rejectUnknownFields(record, rootFields, "benchmark policy");
  if (record.schemaVersion !== 1) {
    throw new Error("benchmark policy schemaVersion must be 1.");
  }
  const devices = requireRecord(record.devices, "devices");
  rejectUnknownFields(devices, new Set(["desktop-wsl2", "pi5"]), "devices");
  if (!("desktop-wsl2" in devices) || !("pi5" in devices)) {
    throw new Error("devices must define desktop-wsl2 and pi5.");
  }
  const deviceFields = new Set([
    "sttFinalizationP95Ms",
    "sttRealTimeFactorP95",
    "ttsFirstAudioP95Ms",
    "ttsRealTimeFactorP95",
  ]);
  const parseDevice = (deviceId: "desktop-wsl2" | "pi5") => {
    const device = requireRecord(devices[deviceId], deviceId);
    rejectUnknownFields(device, deviceFields, deviceId);
    return Object.freeze({
      sttFinalizationP95Ms: requirePositiveNumber(
        device.sttFinalizationP95Ms,
        `${deviceId}.sttFinalizationP95Ms`,
      ),
      sttRealTimeFactorP95: requireRate(
        device.sttRealTimeFactorP95,
        `${deviceId}.sttRealTimeFactorP95`,
      ),
      ttsFirstAudioP95Ms: requirePositiveNumber(
        device.ttsFirstAudioP95Ms,
        `${deviceId}.ttsFirstAudioP95Ms`,
      ),
      ttsRealTimeFactorP95: requireRate(
        device.ttsRealTimeFactorP95,
        `${deviceId}.ttsRealTimeFactorP95`,
      ),
    });
  };

  return Object.freeze({
    devices: Object.freeze({
      "desktop-wsl2": parseDevice("desktop-wsl2"),
      pi5: parseDevice("pi5"),
    }),
    installBytesMaximum: requirePositiveInteger(
      record.installBytesMaximum,
      "installBytesMaximum",
    ),
    minimumPersonalSamples: requirePositiveInteger(
      record.minimumPersonalSamples,
      "minimumPersonalSamples",
    ),
    peakRssBytesMaximum: requirePositiveInteger(
      record.peakRssBytesMaximum,
      "peakRssBytesMaximum",
    ),
    personalExactMatchRate: requireRate(
      record.personalExactMatchRate,
      "personalExactMatchRate",
    ),
    referenceWordErrorRate: requireRate(
      record.referenceWordErrorRate,
      "referenceWordErrorRate",
    ),
    schemaVersion: 1,
    shutdownMaximumMs: requirePositiveNumber(
      record.shutdownMaximumMs,
      "shutdownMaximumMs",
    ),
    startupMaximumMs: requirePositiveNumber(
      record.startupMaximumMs,
      "startupMaximumMs",
    ),
    ttsIntelligibilityMean: requireRating(
      record.ttsIntelligibilityMean,
      "ttsIntelligibilityMean",
    ),
    ttsNaturalnessMean: requireRating(
      record.ttsNaturalnessMean,
      "ttsNaturalnessMean",
    ),
  });
}

function rejectUnknownFields(
  record: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  label: string,
): void {
  const unknown = Object.keys(record).find((field) => !allowed.has(field));
  if (unknown) {
    throw new Error(`${label} contains unknown field ${unknown}.`);
  }
}

function requirePositiveNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number.`);
  }
  return value;
}

function requireRate(value: unknown, label: string): number {
  const rate = requirePositiveNumber(value, label);
  if (rate > 1) {
    throw new Error(`${label} must be at most 1.`);
  }
  return rate;
}

function requireRating(value: unknown, label: string): number {
  const rating = requirePositiveNumber(value, label);
  if (rating > 5) {
    throw new Error(`${label} must be at most 5.`);
  }
  return rating;
}
