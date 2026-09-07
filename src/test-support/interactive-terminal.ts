import { EventEmitter } from "node:events";
import { createInterface } from "node:readline/promises";
import { PassThrough } from "node:stream";
import { createInteractiveTerminal } from "../runtimes/interactive-terminal.js";

export function createInteractiveTerminalHarness() {
  const input = new PassThrough();
  const output = new PassThrough();
  let text = "";
  output.setEncoding("utf8");
  output.on("data", (chunk: string) => {
    text += chunk;
  });
  const questions = createInterface({ input, output, terminal: true });
  const processSignals = new EventEmitter();
  return {
    input,
    questions,
    processSignals,
    readOutput: () => text,
    terminal: createInteractiveTerminal({ questions, processSignals }),
    writeLine: (line: string) => {
      output.write(`${line}\n`);
    },
  };
}
