import { readFile } from "node:fs/promises";

describe("package scripts", () => {
  it("loads local .env values for development CLI runs when present", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.cli).toBe(
      "node --env-file-if-exists=.env --import tsx src/runtimes/cli/main.ts",
    );
  });

  it("provides a focused file test command", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.["test:file"]).toBe("vitest --run");
  });

  it("provides the guided incremental voice corpus capture command", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.["benchmark:voice:capture"]).toBe(
      "node --import tsx src/runtimes/voice-benchmark/capture-main.ts",
    );
  });

  it("provides a focused live OpenAI Pi alarm smoke command", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.["test:e2e:openai:pi"]).toContain(
      "pi-service-openai-alarms.e2e.test.ts",
    );
  });
});
