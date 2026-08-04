/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment: "No circular dependencies are allowed.",
      from: {},
      to: { circular: true },
    },
    {
      name: "core-not-to-adapters",
      severity: "error",
      comment: "Core must not import concrete adapters.",
      from: { path: "^src/core" },
      to: { path: "^src/adapters" },
    },
    {
      name: "core-not-to-features",
      severity: "error",
      comment: "Core must not import feature implementations.",
      from: { path: "^src/core", pathNot: "\\.test\\.ts$" },
      to: { path: "^src/features" },
    },
    {
      name: "core-not-to-runtimes",
      severity: "error",
      comment: "Core must not import runtime composition code.",
      from: { path: "^src/core" },
      to: { path: "^src/runtimes" },
    },
    {
      name: "features-not-to-adapters",
      severity: "error",
      comment: "Features must not import concrete adapters.",
      from: { path: "^src/features" },
      to: { path: "^src/adapters" },
    },
    {
      name: "features-not-to-core",
      severity: "error",
      comment: "Features must not import assistant core implementation.",
      from: { path: "^src/features" },
      to: { path: "^src/core" },
    },
    {
      name: "features-not-to-runtimes",
      severity: "error",
      comment: "Features must not import runtime composition code.",
      from: { path: "^src/features" },
      to: { path: "^src/runtimes" },
    },
    {
      name: "adapters-not-to-core",
      severity: "error",
      comment: "Adapters must not import assistant core implementation.",
      from: { path: "^src/adapters" },
      to: { path: "^src/core" },
    },
    {
      name: "adapters-not-to-features",
      severity: "error",
      comment: "Adapters must not import feature implementations.",
      from: { path: "^src/adapters" },
      to: { path: "^src/features" },
    },
    {
      name: "adapters-not-to-runtimes",
      severity: "error",
      comment: "Adapters must not import runtime composition code.",
      from: { path: "^src/adapters" },
      to: { path: "^src/runtimes" },
    },
    {
      name: "ports-not-to-implementation",
      severity: "error",
      comment: "Ports must not import implementation modules.",
      from: { path: "^src/ports", pathNot: "\\.test\\.ts$" },
      to: { path: "^src/(application|core|features|adapters|runtimes)" },
    },
    {
      name: "application-not-to-implementation",
      severity: "error",
      comment:
        "Shared application policy must depend only on ports or application-local code.",
      from: { path: "^src/application" },
      to: { path: "^src/(core|features|adapters|runtimes)" },
    },
    {
      name: "core-features-not-to-node-or-packages",
      severity: "error",
      comment:
        "Core and features must use injected ports instead of Node built-ins or provider packages.",
      from: { path: "^src/(core|features)", pathNot: "\\.test\\.ts$" },
      to: { dependencyTypes: ["core", "npm"] },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "node_modules|dist|coverage" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
  },
};
