import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { aggregateBenchmarkChunks } from "./benchmark-aggregate.js";
import { parseCandidateManifest } from "./candidate-manifest.js";
import { parseRecordingIndex } from "./corpus-manifest.js";
import { parseTtsCorpus } from "./tts-corpus.js";

const inputDirectory = ".voice-benchmark/results/desktop-wsl2/chunks";
const outputPath = "benchmarks/voice/results/desktop-wsl2.json";
const names = (await readdir(inputDirectory)).filter((name) =>
  name.endsWith(".json"),
);
const chunks = await Promise.all(
  names.map(
    async (name) =>
      JSON.parse(
        await readFile(`${inputDirectory}/${name}`, "utf8"),
      ) as unknown,
  ),
);
const candidates = parseCandidateManifest(
  JSON.parse(
    await readFile("benchmarks/voice/candidates.json", "utf8"),
  ) as unknown,
).candidates;
const recordings = parseRecordingIndex(
  JSON.parse(
    await readFile("benchmarks/voice/corpus/personal-recordings.json", "utf8"),
  ) as unknown,
);
const ttsCorpus = parseTtsCorpus(
  JSON.parse(
    await readFile("benchmarks/voice/corpus/tts-responses.json", "utf8"),
  ) as unknown,
);
const result = aggregateBenchmarkChunks(chunks, {
  candidates: candidates.map((candidate) => ({
    candidateId: candidate.id,
    kind: candidate.operation,
    sampleIds:
      candidate.operation === "stt"
        ? recordings.recordings.map(({ phraseId }) => phraseId)
        : ttsCorpus.fixtures.map(({ id }) => id),
  })),
  deviceId: "desktop-wsl2",
});
await mkdir("benchmarks/voice/results", { recursive: true });
const temporaryPath = `${outputPath}.tmp`;
await writeFile(temporaryPath, `${JSON.stringify(result, undefined, 2)}\n`);
await rename(temporaryPath, outputPath);
process.stdout.write(`${outputPath}\n`);
