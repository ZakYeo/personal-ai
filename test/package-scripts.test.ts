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

  it("provides a packed-artifact CLI smoke command", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.["smoke:package"]).toBe(
      "npm run build && node scripts/smoke-package.mjs",
    );
    expect(packageJson.scripts?.check).toContain("npm run smoke:package");
  });

  it("provides the guided incremental voice corpus capture command", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.["benchmark:voice:capture"]).toBe(
      "node --import tsx src/runtimes/voice-benchmark/capture-main.ts",
    );
    expect(packageJson.scripts?.["benchmark:voice:run"]).toBe(
      "node --import tsx src/runtimes/voice-benchmark/desktop-benchmark-main.ts",
    );
    expect(packageJson.scripts?.["benchmark:voice:aggregate"]).toBe(
      "node --import tsx src/runtimes/voice-benchmark/benchmark-aggregate-main.ts",
    );
  });

  it("provides an offline-only voice artifact verification command", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.["benchmark:voice:verify-artifacts"]).toBe(
      "node --import tsx src/runtimes/voice-benchmark/artifact-verify-main.ts",
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

  it("provides focused live OpenAI weather and task routing smoke commands", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.["test:e2e:openai:weather"]).toContain(
      "openai-weather.e2e.test.ts",
    );
    expect(packageJson.scripts?.["test:e2e:openai:tasks"]).toContain(
      "openai-persistent-tasks.e2e.test.ts",
    );
    expect(packageJson.scripts?.["test:e2e:openai"]).toContain(
      "openai-weather.e2e.test.ts",
    );
    expect(packageJson.scripts?.["test:e2e:openai"]).toContain(
      "openai-persistent-tasks.e2e.test.ts",
    );
  });

  it("provides a focused live OpenAI intent flexibility smoke command", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.["test:e2e:openai:intent"]).toContain(
      "openai-intent-routing.e2e.test.ts",
    );
  });

  it("includes the response rewriter in focused and aggregate live OpenAI smoke commands", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.["test:e2e:openai:rewriter"]).toContain(
      "openai-response-rewriter.e2e.test.ts",
    );
    expect(packageJson.scripts?.["test:e2e:openai"]).toContain(
      "openai-response-rewriter.e2e.test.ts",
    );
  });
});
