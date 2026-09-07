import { readFile } from "node:fs/promises";
// cspell:ignore libwebkit

describe("application confidence CI", () => {
  it("requires the complete local gate with native and browser prerequisites", async () => {
    const workflow = await readFile(
      ".github/workflows/application.yml",
      "utf8",
    );
    const confidence = workflow
      .split("  confidence:")[1]
      ?.split("  coverage:")[0];
    expect(confidence).toBeDefined();
    expect(confidence).toContain("npm run check");
    expect(confidence).not.toMatch(
      /continue-on-error|--ignore-scripts|--passWithNoTests/,
    );
    expect(confidence).toContain("libwebkit2gtk-4.1-dev");
    expect(confidence).toContain("libgtk-3-dev");
    expect(confidence).toContain("playwright install --with-deps chromium");
    expect(confidence).toContain("semgrep==");
    expect(confidence).toContain("components: rustfmt");
    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("branches: [master]");
  });
});
