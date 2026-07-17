import { parseGnuTimeTelemetry } from "./command-telemetry.js";

describe("voice benchmark command telemetry", () => {
  it("parses bounded GNU time output into benchmark units", () => {
    expect(parseGnuTimeTelemetry("0.12\t0.03\t45678\t0.42\n")).toEqual({
      cpuMs: 150,
      peakRssBytes: 46_774_272,
      wallMs: 420,
    });
  });

  it("rejects malformed, negative, and non-finite measurements", () => {
    expect(() => parseGnuTimeTelemetry("bad")).toThrow(/four/iu);
    expect(() => parseGnuTimeTelemetry("-1\t0\t1\t1")).toThrow(/nonnegative/iu);
    expect(() => parseGnuTimeTelemetry("0\t0\tInfinity\t1")).toThrow(
      /finite/iu,
    );
  });
});
