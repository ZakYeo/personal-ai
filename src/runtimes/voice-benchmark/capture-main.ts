import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";

import { runCommand } from "../../adapters/desktop/process-runner.js";
import {
  runVoiceCorpusCaptureCli,
  selectCaptureAudioProfile,
} from "./capture-cli.js";

const input = process.stdin;
const output = process.stdout;
const questions = createInterface({ input, output });
const shutdown = new AbortController();
const requestShutdown = () => shutdown.abort(new Error("Capture interrupted."));
process.once("SIGINT", requestShutdown);
process.once("SIGTERM", requestShutdown);

try {
  process.exitCode = await runVoiceCorpusCaptureCli(process.argv.slice(2), {
    audioProfile: selectCaptureAudioProfile(process.env.PULSE_SERVER),
    copyFile,
    makeDirectory: async (path) => {
      await mkdir(path, { recursive: true });
    },
    now: () => new Date(),
    question: (prompt) =>
      questions.question(prompt, { signal: shutdown.signal }),
    readBinaryFile: (path) => readFile(path),
    readTextFile: (path) => readFile(path, "utf8"),
    removeFile: (path) => rm(path, { force: true }),
    runCommand: async (request) => {
      await runCommand({
        ...request,
        environment: {
          PATH: process.env.PATH,
          PULSE_SERVER: process.env.PULSE_SERVER,
        },
      });
    },
    shutdownSignal: shutdown.signal,
    writeDiagnostic: (error) => console.error(error),
    writeLine: (line) => console.log(line),
    writeTextFile: (path, contents) => writeFile(path, contents, "utf8"),
  });
} finally {
  process.removeListener("SIGINT", requestShutdown);
  process.removeListener("SIGTERM", requestShutdown);
  questions.close();
}
