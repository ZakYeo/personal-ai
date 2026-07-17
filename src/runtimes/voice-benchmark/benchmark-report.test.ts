import { readFile } from "node:fs/promises";

import { parseBenchmarkResult } from "./benchmark-aggregate.js";
import { parseVoiceBenchmarkPolicy } from "./benchmark-policy.js";
import { renderDesktopBenchmarkReport } from "./benchmark-report.js";

describe("voice benchmark report", () => {
  it("renders the committed result without overstating unavailable evidence", async () => {
    const result = parseBenchmarkResult(
      JSON.parse(
        await readFile("benchmarks/voice/results/desktop-wsl2.json", "utf8"),
      ) as unknown,
    );
    const policy = parseVoiceBenchmarkPolicy(
      JSON.parse(
        await readFile("benchmarks/voice/policy.json", "utf8"),
      ) as unknown,
    );

    const report = renderDesktopBenchmarkReport(result, policy);

    expect(report).toContain("desktop-only, partial acceptance run");
    expect(report).toContain("not evidence of network isolation");
    expect(report).toContain("Shutdown was not measured");
    expect(report).toContain("whisper-small-en");
    expect(report).not.toContain("All candidates ran without network access");
  });
});
