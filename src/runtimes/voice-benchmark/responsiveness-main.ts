import { createReadStream } from "node:fs";
import { logRuntimeFailure } from "../human-boundary.js";
import { runVoiceResponsivenessReport } from "./responsiveness-cli.js";

process.exitCode = await runVoiceResponsivenessReport(process.argv.slice(2), {
  load: async (path) => {
    const maximumBytes = 1_048_576;
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of createReadStream(path, {
      start: 0,
      end: maximumBytes,
      signal: AbortSignal.timeout(30_000),
    })) {
      if (!Buffer.isBuffer(chunk))
        throw new Error("Unexpected measurement file chunk.");
      bytes += chunk.length;
      if (bytes > maximumBytes)
        throw new Error("Measurement file exceeds one MiB.");
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  },
  writeLine: (line) => {
    process.stdout.write(`${line}\n`);
  },
  reportFailure: (error) =>
    logRuntimeFailure(error, { stderr: process.stderr }),
});
