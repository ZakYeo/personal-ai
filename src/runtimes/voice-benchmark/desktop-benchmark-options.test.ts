import { parseDesktopBenchmarkOptions } from "./desktop-benchmark-options.js";

describe("desktop benchmark options", () => {
  it("parses one bounded resumable candidate chunk", () => {
    expect(
      parseDesktopBenchmarkOptions([
        "--candidate",
        "whisper-base-en",
        "--start",
        "5",
        "--count",
        "4",
        "--output",
        ".voice-benchmark/results/chunk.json",
      ]),
    ).toEqual({
      candidateId: "whisper-base-en",
      count: 4,
      outputPath: ".voice-benchmark/results/chunk.json",
      start: 5,
    });
  });

  it("rejects unsafe output paths and unbounded or malformed chunks", () => {
    expect(() => parseDesktopBenchmarkOptions([])).toThrow(/candidate/iu);
    expect(() =>
      parseDesktopBenchmarkOptions([
        "--candidate",
        "whisper-base-en",
        "--start",
        "0",
        "--count",
        "0",
        "--output",
        "../result.json",
      ]),
    ).toThrow(/count/iu);
    expect(() =>
      parseDesktopBenchmarkOptions([
        "--candidate",
        "Whisper Base",
        "--start",
        "0",
        "--count",
        "1",
        "--output",
        "result.json",
      ]),
    ).toThrow(/stable lowercase identifier/iu);
  });
});
