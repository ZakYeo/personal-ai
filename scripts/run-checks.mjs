#!/usr/bin/env node

import { spawn } from "node:child_process";
import { EOL } from "node:os";

const checkGroups = {
  "pre-commit": [
    ["package sort", "npm", ["run", "package:sort:check"]],
    ["secrets", "npm", ["run", "secrets:check"]],
    ["knip", "npm", ["run", "knip"]],
    ["architecture", "npm", ["run", "architecture:check"]],
    ["tests", "npm", ["run", "test:run"]],
    ["typecheck", "npm", ["run", "typecheck"]],
    ["bin", "npm", ["run", "bin:check"]],
  ],
};

const mode = process.argv[2];
const checks = mode ? checkGroups[mode] : undefined;

if (!checks) {
  console.error(
    `Usage: node scripts/run-checks.mjs ${Object.keys(checkGroups).join("|")}`,
  );
  process.exitCode = 1;
} else {
  const results = await Promise.all(checks.map(runCheck));
  const failedChecks = results.filter((result) => result.exitCode !== 0);

  if (failedChecks.length > 0) {
    console.error(
      `Failed checks: ${failedChecks.map((result) => result.label).join(", ")}`,
    );
    process.exitCode = 1;
  }
}

function runCheck([label, command, args]) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdoutDone = prefixStream(label, child.stdout, process.stdout);
    const stderrDone = prefixStream(label, child.stderr, process.stderr);

    child.once("error", (error) => {
      console.error(`[${label}] ${error.message}`);
      resolve({ exitCode: 1, label });
    });

    child.once("close", async (exitCode) => {
      await Promise.all([stdoutDone, stderrDone]);
      resolve({ exitCode: exitCode ?? 1, label });
    });
  });
}

function prefixStream(label, source, target) {
  let pending = "";

  source.setEncoding("utf8");

  return new Promise((resolve) => {
    source.on("data", (chunk) => {
      pending += chunk;
      const lines = pending.split(/\r?\n/u);
      pending = lines.pop() ?? "";

      for (const line of lines) {
        target.write(`[${label}] ${line}${EOL}`);
      }
    });

    source.on("end", () => {
      if (pending) {
        target.write(`[${label}] ${pending}${EOL}`);
      }

      resolve();
    });
  });
}
