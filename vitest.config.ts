import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      exclude: [
        "coverage/**",
        "dist/**",
        "scripts/**",
        "src/**/*.test.ts",
        "src/test-support/**",
        "*.config.*",
      ],
      include: ["src/**/*.ts"],
      provider: "v8",
      thresholds: {
        branches: 70,
        functions: 70,
        lines: 70,
        statements: 70,
      },
    },
    globals: true,
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
    passWithNoTests: true,
  },
});
