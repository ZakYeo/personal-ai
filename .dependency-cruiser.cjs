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
      name: "core-not-to-runtimes",
      severity: "error",
      comment: "Core must not import runtime composition code.",
      from: { path: "^src/core" },
      to: { path: "^src/runtimes" },
    },
    {
      name: "features-not-to-adapters",
      severity: "error",
      comment: "Features must not import concrete provider adapters.",
      from: { path: "^src/features" },
      to: { path: "^src/adapters" },
    },
    {
      name: "adapters-not-to-runtimes",
      severity: "error",
      comment: "Adapters must not import runtime composition code.",
      from: { path: "^src/adapters" },
      to: { path: "^src/runtimes" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "node_modules|dist|coverage" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
  },
};
