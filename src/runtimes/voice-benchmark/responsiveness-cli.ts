import { buildVoiceResponsivenessReport } from "./responsiveness-report.js";

export async function runVoiceResponsivenessReport(
  args: readonly string[],
  options: {
    load(path: string): Promise<unknown>;
    writeLine(line: string): void;
    reportFailure(error: unknown): void;
  },
): Promise<number> {
  if (args.length !== 2 || args[0] !== "--input" || !args[1]?.trim()) {
    options.writeLine(
      "Usage: npm run benchmark:voice:responsiveness -- --input measurements.json",
    );
    return 1;
  }
  try {
    const report = buildVoiceResponsivenessReport(await options.load(args[1]));
    options.writeLine(JSON.stringify(report, null, 2));
    return report.acceptance === "passed" ? 0 : 2;
  } catch (error) {
    options.reportFailure(error);
    options.writeLine(
      "The responsiveness report could not be generated. Check the measurement file and its schema.",
    );
    return 1;
  }
}
