import { readFile } from "node:fs/promises";
import {
  createCapturedWriter,
  deterministicTestNowIso,
  line,
  writeTempJsonFile,
} from "./primitives.js";

describe("neutral test primitives", () => {
  it("owns the canonical deterministic date", () => {
    expect(deterministicTestNowIso).toBe("2026-06-26T09:00:00.000Z");
  });

  it("captures writer output without runtime-specific behavior", () => {
    const writer = createCapturedWriter();

    writer.write(line("hello"));

    expect(writer.writes).toEqual(["hello\n"]);
  });

  it("writes temporary JSON files", async () => {
    const filePath = await writeTempJsonFile({ assistant: "Jarvis" });

    await expect(readFile(filePath, "utf8")).resolves.toBe(
      '{"assistant":"Jarvis"}',
    );
  });
});
