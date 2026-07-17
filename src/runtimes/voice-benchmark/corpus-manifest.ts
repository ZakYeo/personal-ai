import {
  requireArray,
  requireNonEmptyString,
  requirePositiveInteger,
  requireRecord,
  requireStableId,
} from "./structural-parsing.js";

export interface CorpusPhrase {
  active: boolean;
  capabilities: string[];
  captureTier: CaptureTier;
  id: string;
  text: string;
}

export type CaptureScope = "all" | "core";
export type CaptureTier = "core" | "extended";

export interface CorpusManifest {
  phrases: CorpusPhrase[];
  schemaVersion: 1;
}

export interface AcceptedRecording {
  bitsPerSample: 16;
  channels: 1;
  consentedAt: string;
  filePath: string;
  phraseId: string;
  phraseText: string;
  sampleRate: 16_000;
  sha256: string;
  speakerId: string;
  speechEndSample: number;
}

export interface RecordingIndex {
  recordings: AcceptedRecording[];
  schemaVersion: 1;
}

export function parseCorpusManifest(input: unknown): CorpusManifest {
  const record = requireRecord(input, "voice corpus manifest");
  requireSchemaVersion(record.schemaVersion);
  const phrases = requireArray(record.phrases, "phrases").map((phrase, index) =>
    parsePhrase(phrase, index),
  );
  rejectDuplicates(
    phrases.map((phrase) => phrase.id),
    "phrase ID",
  );

  return { phrases, schemaVersion: 1 };
}

export function parseRecordingIndex(input: unknown): RecordingIndex {
  const record = requireRecord(input, "voice recording index");
  requireSchemaVersion(record.schemaVersion);
  const recordings = requireArray(record.recordings, "recordings").map(
    (recording, index) => parseRecording(recording, index),
  );
  rejectDuplicates(
    recordings.map((recording) => recording.phraseId),
    "recording phrase ID",
  );

  return { recordings, schemaVersion: 1 };
}

export function findMissingRecordings(
  manifest: CorpusManifest,
  index: RecordingIndex,
  scope: CaptureScope = "all",
): CorpusPhrase[] {
  validateRecordingIndex(manifest, index);
  const recordedPhraseIds = new Set(
    index.recordings.map((recording) => recording.phraseId),
  );

  return manifest.phrases.filter(
    (phrase) =>
      phrase.active &&
      (scope === "all" || phrase.captureTier === "core") &&
      !recordedPhraseIds.has(phrase.id),
  );
}

export function findUncoveredCapabilities(
  capabilityNames: readonly string[],
  manifest: CorpusManifest,
  scope: CaptureScope = "all",
): string[] {
  const coveredCapabilities = new Set(
    manifest.phrases
      .filter(
        (phrase) =>
          phrase.active && (scope === "all" || phrase.captureTier === "core"),
      )
      .flatMap((phrase) => phrase.capabilities),
  );

  return [...new Set(capabilityNames)]
    .filter((name) => !coveredCapabilities.has(name))
    .sort();
}

export function validateRecordingIndex(
  manifest: CorpusManifest,
  index: RecordingIndex,
): void {
  const phrasesById = new Map(
    manifest.phrases.map((phrase) => [phrase.id, phrase]),
  );

  for (const recording of index.recordings) {
    const phrase = phrasesById.get(recording.phraseId);
    if (!phrase) {
      throw new Error(
        `Recording ${recording.phraseId} refers to an unknown phrase. Retire phrases instead of deleting their history.`,
      );
    }
    if (phrase.text !== recording.phraseText) {
      throw new Error(
        `Recording ${recording.phraseId} no longer matches its spoken text. Add a new phrase ID instead of changing recorded words.`,
      );
    }
  }
}

function parsePhrase(input: unknown, index: number): CorpusPhrase {
  const record = requireRecord(input, `phrases[${index}]`);
  const capabilities = requireArray(
    record.capabilities,
    `phrases[${index}].capabilities`,
  ).map((capability, capabilityIndex) =>
    requireNonEmptyString(
      capability,
      `phrases[${index}].capabilities[${capabilityIndex}]`,
    ),
  );
  if (capabilities.length === 0) {
    throw new Error(`phrases[${index}].capabilities must not be empty.`);
  }
  rejectDuplicates(capabilities, `capability in phrases[${index}]`);

  return {
    active: requireBoolean(record.active, `phrases[${index}].active`),
    capabilities,
    captureTier: requireCaptureTier(
      record.captureTier,
      `phrases[${index}].captureTier`,
    ),
    id: requireStableId(record.id, `phrases[${index}].id`),
    text: requireNonEmptyString(record.text, `phrases[${index}].text`),
  };
}

function requireCaptureTier(input: unknown, label: string): CaptureTier {
  if (input !== "core" && input !== "extended") {
    throw new Error(`${label} must be core or extended.`);
  }
  return input;
}

function parseRecording(input: unknown, index: number): AcceptedRecording {
  const record = requireRecord(input, `recordings[${index}]`);
  const consentedAt = requireNonEmptyString(
    record.consentedAt,
    `recordings[${index}].consentedAt`,
  );
  if (Number.isNaN(Date.parse(consentedAt))) {
    throw new Error(
      `recordings[${index}].consentedAt must be an ISO timestamp.`,
    );
  }
  const filePath = requireNonEmptyString(
    record.filePath,
    `recordings[${index}].filePath`,
  );
  if (filePath.startsWith("/") || filePath.split("/").includes("..")) {
    throw new Error(
      `recordings[${index}].filePath must be repository-relative.`,
    );
  }
  const sha256 = requireNonEmptyString(
    record.sha256,
    `recordings[${index}].sha256`,
  );
  if (!/^[a-f\d]{64}$/u.test(sha256)) {
    throw new Error(
      `recordings[${index}].sha256 must be 64 lowercase hex characters.`,
    );
  }

  return {
    bitsPerSample: requireLiteral(
      record.bitsPerSample,
      16,
      `recordings[${index}].bitsPerSample`,
    ),
    channels: requireLiteral(
      record.channels,
      1,
      `recordings[${index}].channels`,
    ),
    consentedAt,
    filePath,
    phraseId: requireStableId(record.phraseId, `recordings[${index}].phraseId`),
    phraseText: requireNonEmptyString(
      record.phraseText,
      `recordings[${index}].phraseText`,
    ),
    sampleRate: requireLiteral(
      record.sampleRate,
      16_000,
      `recordings[${index}].sampleRate`,
    ),
    sha256,
    speakerId: requireStableId(
      record.speakerId,
      `recordings[${index}].speakerId`,
    ),
    speechEndSample: requirePositiveInteger(
      record.speechEndSample,
      `recordings[${index}].speechEndSample`,
    ),
  };
}

function requireSchemaVersion(input: unknown): asserts input is 1 {
  if (input !== 1) {
    throw new Error("Voice benchmark schemaVersion must be 1.");
  }
}

function requireBoolean(input: unknown, label: string): boolean {
  if (typeof input !== "boolean") {
    throw new Error(`${label} must be a boolean.`);
  }
  return input;
}

function requireLiteral<const Value extends number>(
  input: unknown,
  expected: Value,
  label: string,
): Value {
  if (input !== expected) {
    throw new Error(`${label} must be ${expected}.`);
  }
  return expected;
}

function rejectDuplicates(values: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      throw new Error(`Voice corpus contains a duplicate ${label}: ${value}.`);
    }
    seen.add(value);
  }
}
