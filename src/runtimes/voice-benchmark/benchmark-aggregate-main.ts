import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { aggregateBenchmarkChunks } from "./benchmark-aggregate.js";

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
await mkdir("benchmarks/voice/results", { recursive: true });
await writeFile(
  outputPath,
  `${JSON.stringify(aggregateBenchmarkChunks(chunks), undefined, 2)}\n`,
);
process.stdout.write(`${outputPath}\n`);
