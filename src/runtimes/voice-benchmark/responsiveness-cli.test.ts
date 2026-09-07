import { readFile } from "node:fs/promises";
import { runVoiceResponsivenessReport } from "./responsiveness-cli.js";

describe("responsiveness report command", () => {
  it("renders the committed synthetic template as incomplete evidence", async () => {
    const fixture: unknown = JSON.parse(
      await readFile(
        new URL(
          "../../../benchmarks/voice/responsiveness-template.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const output: string[] = [];
    const load = vi.fn(() => Promise.resolve(fixture));
    const exitCode = await runVoiceResponsivenessReport(
      ["--input", "measurements.json"],
      { load, writeLine: (line) => output.push(line), reportFailure: vi.fn() },
    );
    expect(exitCode).toBe(2);
    expect(load).toHaveBeenCalledExactlyOnceWith("measurements.json");
    expect(JSON.parse(output[0]!) as unknown).toMatchObject({
      acceptance: "incomplete",
      evidence: "synthetic",
    });
  });
  it("rejects malformed arguments before opening a file", async () => {
    const load = vi.fn();
    expect(
      await runVoiceResponsivenessReport([], {
        load,
        writeLine: vi.fn(),
        reportFailure: vi.fn(),
      }),
    ).toBe(1);
    expect(load).not.toHaveBeenCalled();
  });
  it("preserves load diagnostics while presenting a safe failure", async () => {
    const error = new Error("private file details");
    const writeLine = vi.fn();
    const reportFailure = vi.fn();
    expect(
      await runVoiceResponsivenessReport(["--input", "measurements.json"], {
        load: () => Promise.reject(error),
        writeLine,
        reportFailure,
      }),
    ).toBe(1);
    expect(reportFailure).toHaveBeenCalledExactlyOnceWith(error);
    expect(writeLine).toHaveBeenCalledExactlyOnceWith(
      "The responsiveness report could not be generated. Check the measurement file and its schema.",
    );
  });
});
