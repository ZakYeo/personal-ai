import { createHash } from "node:crypto";

import type {
  AcceptedRecording,
  CorpusManifest,
  CorpusPhrase,
  RecordingIndex,
} from "./corpus-manifest.js";
import {
  findMissingRecordings,
  validateRecordingIndex,
} from "./corpus-manifest.js";

interface RecordingInspection {
  bitsPerSample: 16;
  channels: 1;
  sampleRate: 16_000;
  sha256: string;
  speechEndSample: number;
}

interface CaptureDependencies {
  askForConsent(): Promise<boolean>;
  chooseRecording(): Promise<"accept" | "rerecord">;
  inspectRecording(filePath: string): Promise<RecordingInspection>;
  now(): Date;
  playRecording(filePath: string): Promise<void>;
  reportInvalidRecording(error: unknown): Promise<void>;
  promoteRecording(input: {
    phraseId: string;
    stagingPath: string;
  }): Promise<string>;
  recordPhrase(input: {
    attempt: number;
    phrase: CorpusPhrase;
  }): Promise<string>;
  speakerId: string;
}

interface StagedRecording {
  inspection: RecordingInspection;
  phrase: CorpusPhrase;
  stagingPath: string;
}

export async function captureMissingCorpusRecordings(
  manifest: CorpusManifest,
  index: RecordingIndex,
  dependencies: CaptureDependencies,
): Promise<RecordingIndex> {
  const missingPhrases = findMissingRecordings(manifest, index);
  if (missingPhrases.length === 0) {
    return index;
  }

  const stagedRecordings: StagedRecording[] = [];
  for (const phrase of missingPhrases) {
    stagedRecordings.push(await captureAcceptedPhrase(phrase, dependencies));
  }

  if (!(await dependencies.askForConsent())) {
    throw new Error(
      "Recording consent was declined; no staged personal recordings were promoted.",
    );
  }

  const consentedAt = dependencies.now().toISOString();
  const promoted: AcceptedRecording[] = [];
  for (const staged of stagedRecordings) {
    const filePath = await dependencies.promoteRecording({
      phraseId: staged.phrase.id,
      stagingPath: staged.stagingPath,
    });
    promoted.push({
      ...staged.inspection,
      consentedAt,
      filePath,
      phraseId: staged.phrase.id,
      phraseText: staged.phrase.text,
      speakerId: dependencies.speakerId,
    });
  }

  const result: RecordingIndex = {
    recordings: [...index.recordings, ...promoted],
    schemaVersion: 1,
  };
  validateRecordingIndex(manifest, result);
  return result;
}

export function inspectCapturedPcmWav(wav: Buffer): RecordingInspection {
  const format = readWavFormat(wav);
  if (
    format.audioFormat !== 1 ||
    format.sampleRate !== 16_000 ||
    format.channels !== 1 ||
    format.bitsPerSample !== 16
  ) {
    throw new Error(
      "Personal corpus recordings must be 16 kHz mono signed 16-bit PCM WAV files.",
    );
  }

  const samples = readSamples(wav, format.dataOffset, format.dataBytes);
  const durationSeconds = samples.length / format.sampleRate;
  if (durationSeconds < 0.5 || durationSeconds > 8) {
    throw new Error(
      "Personal corpus recording duration must be 0.5 to 8 seconds.",
    );
  }

  const clippingSamples = samples.filter(
    (sample) => Math.abs(sample) >= 32_600,
  ).length;
  if (clippingSamples / samples.length > 0.005) {
    throw new Error("Personal corpus recording contains excessive clipping.");
  }

  const speechEndSample = findSpeechEndSample(samples, format.sampleRate);
  if (speechEndSample === 0) {
    throw new Error("Personal corpus recording contains silence only.");
  }

  const trailingSilenceSamples = samples.length - speechEndSample;
  if (
    trailingSilenceSamples < format.sampleRate * 0.25 ||
    trailingSilenceSamples > format.sampleRate * 2
  ) {
    throw new Error(
      "Personal corpus recording must retain 0.25 to 2 seconds of trailing silence.",
    );
  }

  return {
    bitsPerSample: 16,
    channels: 1,
    sampleRate: 16_000,
    sha256: createHash("sha256").update(wav).digest("hex"),
    speechEndSample,
  };
}

async function captureAcceptedPhrase(
  phrase: CorpusPhrase,
  dependencies: CaptureDependencies,
): Promise<StagedRecording> {
  for (let attempt = 1; ; attempt += 1) {
    const stagingPath = await dependencies.recordPhrase({ attempt, phrase });
    let inspection: RecordingInspection;
    try {
      inspection = await dependencies.inspectRecording(stagingPath);
    } catch (error) {
      await dependencies.reportInvalidRecording(error);
      continue;
    }
    await dependencies.playRecording(stagingPath);

    if ((await dependencies.chooseRecording()) === "accept") {
      return { inspection, phrase, stagingPath };
    }
  }
}

interface WavFormat {
  audioFormat: number;
  bitsPerSample: number;
  channels: number;
  dataBytes: number;
  dataOffset: number;
  sampleRate: number;
}

function readWavFormat(wav: Buffer): WavFormat {
  if (
    wav.length < 44 ||
    wav.toString("ascii", 0, 4) !== "RIFF" ||
    wav.toString("ascii", 8, 12) !== "WAVE"
  ) {
    throw new Error("Personal corpus recording is not a RIFF WAVE file.");
  }

  const formatChunk = findChunk(wav, "fmt ");
  const dataChunk = findChunk(wav, "data");
  if (formatChunk.bytes < 16) {
    throw new Error("Personal corpus WAV format chunk is incomplete.");
  }

  return {
    audioFormat: wav.readUInt16LE(formatChunk.offset),
    bitsPerSample: wav.readUInt16LE(formatChunk.offset + 14),
    channels: wav.readUInt16LE(formatChunk.offset + 2),
    dataBytes: dataChunk.bytes,
    dataOffset: dataChunk.offset,
    sampleRate: wav.readUInt32LE(formatChunk.offset + 4),
  };
}

function findChunk(
  wav: Buffer,
  expectedId: string,
): { bytes: number; offset: number } {
  let cursor = 12;
  while (cursor + 8 <= wav.length) {
    const id = wav.toString("ascii", cursor, cursor + 4);
    const bytes = wav.readUInt32LE(cursor + 4);
    const offset = cursor + 8;
    if (offset + bytes > wav.length) {
      throw new Error(`Personal corpus WAV ${id} chunk exceeds the file.`);
    }
    if (id === expectedId) {
      return { bytes, offset };
    }
    cursor = offset + bytes + (bytes % 2);
  }

  throw new Error(`Personal corpus WAV is missing its ${expectedId} chunk.`);
}

function readSamples(wav: Buffer, offset: number, bytes: number): number[] {
  if (bytes % 2 !== 0) {
    throw new Error(
      "Personal corpus WAV PCM data must contain complete samples.",
    );
  }
  return Array.from({ length: bytes / 2 }, (_, index) =>
    wav.readInt16LE(offset + index * 2),
  );
}

function findSpeechEndSample(
  samples: readonly number[],
  sampleRate: number,
): number {
  const windowSamples = Math.round(sampleRate * 0.01);
  let speechEndSample = 0;

  for (let offset = 0; offset < samples.length; offset += windowSamples) {
    const window = samples.slice(offset, offset + windowSamples);
    const rootMeanSquare = Math.sqrt(
      window.reduce((total, sample) => total + sample ** 2, 0) / window.length,
    );
    if (rootMeanSquare >= 300) {
      speechEndSample = Math.min(offset + windowSamples, samples.length);
    }
  }

  return speechEndSample;
}
