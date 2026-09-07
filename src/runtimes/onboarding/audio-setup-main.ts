import { createInterface } from "node:readline/promises";
import { createPulseAudioSetup } from "../../adapters/desktop/pulse-audio-setup.js";
import {
  runCommand,
  runCommandReadableStream,
  runCommandWritableStream,
} from "../../adapters/desktop/process-runner.js";
import { humanizeSpokenText } from "../../application/human-text.js";
import { logRuntimeFailure } from "../human-boundary.js";
import { runAudioSetupSession } from "./audio-setup-session.js";

const questions = createInterface({
  input: process.stdin,
  output: process.stdout,
});
const shutdown = new AbortController();
const stop = () => shutdown.abort(new Error("Audio setup interrupted."));
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
try {
  process.exitCode = await runAudioSetupSession({
    audio: createPulseAudioSetup({
      run: runCommand,
      read: runCommandReadableStream,
      write: runCommandWritableStream,
      environment: {
        PATH: process.env.PATH,
        PULSE_SERVER: process.env.PULSE_SERVER,
        XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR,
      },
    }),
    question: (prompt) =>
      questions.question(prompt, { signal: shutdown.signal }),
    reportFailure: (error) =>
      logRuntimeFailure(error, { stderr: process.stderr }),
    signal: shutdown.signal,
    writeLine: (line) =>
      process.stdout.write(
        `${humanizeSpokenText(line, { now: new Date(), timeZone: "UTC", assistantTimeZone: "UTC" })}\n`,
      ),
  });
} finally {
  questions.close();
  process.removeListener("SIGINT", stop);
  process.removeListener("SIGTERM", stop);
}
