import { createHash } from "node:crypto";

interface RatingClip {
  audioPath: string;
  candidateId: string;
  fixtureId: string;
}

interface BlindedRatingClip {
  audioPath: string;
  blindId: string;
}

interface VoiceBenchmarkRating {
  blindId: string;
  candidateId: string;
  fixtureId: string;
  intelligibility: number;
  materialFactError: boolean;
  naturalness: number;
}

interface VoiceBenchmarkRatings {
  ratings: readonly VoiceBenchmarkRating[];
  resultSha256: string;
  schemaVersion: 1;
}

interface RatingAnswer {
  intelligibility: number;
  materialFactError: boolean;
  naturalness: number;
}

const privateClipLookup = new WeakMap<BlindedRatingClip, RatingClip>();

export function createBlindedRatingQueue(
  clips: readonly RatingClip[],
  resultSha256: string,
): BlindedRatingClip[] {
  const seen = new Set<string>();
  const queue = clips.map((clip) => {
    requireSafePath(clip.audioPath, "audioPath");
    const key = `${clip.candidateId}\0${clip.fixtureId}`;
    if (seen.has(key)) {
      throw new Error(
        `Duplicate rating clip ${clip.candidateId}/${clip.fixtureId}.`,
      );
    }
    seen.add(key);
    const digest = sha256(`${resultSha256}\0${key}`);
    const blindId = `sample-${digest.slice(0, 8)}`;
    const blinded = Object.freeze({
      audioPath: `.voice-benchmark/ratings/${blindId}.wav`,
      blindId,
    });
    privateClipLookup.set(blinded, { ...clip });
    return { blinded, digest };
  });
  queue.sort((left, right) => left.digest.localeCompare(right.digest));
  return queue.map(({ blinded }) => blinded);
}

export function recordVoiceBenchmarkRating(
  existing: VoiceBenchmarkRatings,
  clip: BlindedRatingClip,
  answer: RatingAnswer,
): VoiceBenchmarkRatings {
  const source = privateClipLookup.get(clip);
  if (!source) {
    throw new Error("Rating clip was not created by the blinded queue.");
  }
  if (existing.ratings.some((rating) => rating.blindId === clip.blindId)) {
    throw new Error(`Sample ${clip.blindId} is already rated.`);
  }
  const intelligibility = requireRating(
    answer.intelligibility,
    "intelligibility",
  );
  const naturalness = requireRating(answer.naturalness, "naturalness");
  if (typeof answer.materialFactError !== "boolean") {
    throw new Error("materialFactError must be boolean.");
  }
  return Object.freeze({
    ratings: Object.freeze([
      ...existing.ratings,
      Object.freeze({
        blindId: clip.blindId,
        candidateId: source.candidateId,
        fixtureId: source.fixtureId,
        intelligibility,
        materialFactError: answer.materialFactError,
        naturalness,
      }),
    ]),
    resultSha256: existing.resultSha256,
    schemaVersion: 1,
  });
}

export function parseVoiceBenchmarkRatings(
  input: unknown,
): VoiceBenchmarkRatings {
  const record = requireRecord(input, "ratings");
  if (record.schemaVersion !== 1) {
    throw new Error("ratings schemaVersion must be 1.");
  }
  const resultSha256 = requireDigest(record.resultSha256, "resultSha256");
  if (!Array.isArray(record.ratings)) {
    throw new Error("ratings.ratings must be an array.");
  }
  const blindIds = new Set<string>();
  const ratings = record.ratings.map((value, index) => {
    const rating = requireRecord(value, `ratings[${index}]`);
    const blindId = requireString(rating.blindId, `ratings[${index}].blindId`);
    if (blindIds.has(blindId)) {
      throw new Error(`ratings contains duplicate blindId ${blindId}.`);
    }
    blindIds.add(blindId);
    if (typeof rating.materialFactError !== "boolean") {
      throw new Error(`ratings[${index}].materialFactError must be boolean.`);
    }
    return Object.freeze({
      blindId,
      candidateId: requireString(
        rating.candidateId,
        `ratings[${index}].candidateId`,
      ),
      fixtureId: requireString(rating.fixtureId, `ratings[${index}].fixtureId`),
      intelligibility: requireRating(
        rating.intelligibility,
        `ratings[${index}].intelligibility`,
      ),
      materialFactError: rating.materialFactError,
      naturalness: requireRating(
        rating.naturalness,
        `ratings[${index}].naturalness`,
      ),
    });
  });
  return Object.freeze({
    ratings: Object.freeze(ratings),
    resultSha256,
    schemaVersion: 1,
  });
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a nonempty string.`);
  }
  return value;
}

function requireDigest(value: unknown, label: string): string {
  const digest = requireString(value, label);
  if (!/^[a-f\d]{64}$/u.test(digest)) {
    throw new Error(`${label} must be a SHA-256 digest.`);
  }
  return digest;
}

function requireRating(value: unknown, label: string): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 5
  ) {
    throw new Error(`${label} must be an integer from 1 to 5.`);
  }
  return value;
}

function requireSafePath(value: unknown, label: string): string {
  const path = requireString(value, label);
  if (path.startsWith("/") || path.split("/").includes("..")) {
    throw new Error(`${label} must be a safe relative path.`);
  }
  return path;
}
