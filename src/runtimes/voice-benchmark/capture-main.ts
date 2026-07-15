import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";

import { runCommand } from "../../adapters/desktop/process-runner.js";
import { runVoiceCorpusCaptureCli } from "./capture-cli.js";

const input = process.stdin;
const output = process.stdout;
const questions = createInterface({ input, output });

try {
  process.exitCode = await runVoiceCorpusCaptureCli(process.argv.slice(2), {
    copyFile,
    makeDirectory: async (path) => {
      await mkdir(path, { recursive: true });
    },
    now: () => new Date(),
    question: (prompt) => questions.question(prompt),
    readBinaryFile: (path) => readFile(path),
    readTextFile: (path) => readFile(path, "utf8"),
    removeFile: (path) => rm(path, { force: true }),
    runCommand: async (request) => {
      await runCommand({
        ...request,
        environment: { PATH: process.env.PATH },
      });
    },
    writeLine: (line) => console.log(line),
    writeTextFile: (path, contents) => writeFile(path, contents, "utf8"),
  });
} finally {
  questions.close();
}
