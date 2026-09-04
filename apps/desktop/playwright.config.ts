import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.01 },
  },
  fullyParallel: false,
  reporter: "line",
  testDir: "./e2e",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:4173",
    colorScheme: "dark",
  },
  webServer: {
    command: "npm run desktop:dev -- --mode test --host 127.0.0.1 --port 4173",
    cwd: "../..",
    reuseExistingServer: false,
    timeout: 30_000,
    url: "http://127.0.0.1:4173",
  },
});
