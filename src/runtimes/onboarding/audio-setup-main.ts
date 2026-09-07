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
import { createInteractiveTerminal } from "../interactive-terminal.js";

const questions = createInterface({
  input: process.stdin,
  output: process.stdout,
});
const terminal = createInteractiveTerminal({
  questions,
  processSignals: process,
});
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
    question: terminal.question,
    reportFailure: (error) =>
      logRuntimeFailure(error, { stderr: process.stderr }),
    signal: terminal.signal,
    writeLine: (line) =>
      process.stdout.write(
        `${humanizeSpokenText(line, { now: new Date(), timeZone: "UTC", assistantTimeZone: "UTC" })}\n`,
      ),
  });
} finally {
  terminal.dispose();
}
