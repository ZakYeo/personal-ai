import { spawn } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  open,
  readdir,
  readFile,
  rm,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);
const smokeDirectory = await mkdtemp(
  join(tmpdir(), "personal-ai-package-smoke-"),
);

try {
  const packDirectory = join(smokeDirectory, "pack");
  const extractDirectory = join(smokeDirectory, "extract");
  await mkdir(packDirectory);
  await mkdir(extractDirectory);

  const packed = await runCommand(
    "npm",
    ["pack", "--silent", "--pack-destination", packDirectory],
    repositoryDirectory,
    {
      ...process.env,
      NPM_CONFIG_CACHE: join(smokeDirectory, "npm-cache"),
    },
  );
  assertSucceeded("npm pack", packed);
  const tarballName = resolveTarballName(await readdir(packDirectory));
  const tarballPath = join(packDirectory, tarballName);

  const extracted = await runCommand(
    "tar",
    ["-xzf", tarballPath, "-C", extractDirectory],
    repositoryDirectory,
  );
  assertSucceeded("package extraction", extracted);

  const packageDirectory = join(extractDirectory, "package");
  await symlink(
    join(repositoryDirectory, "node_modules"),
    join(packageDirectory, "node_modules"),
    "dir",
  );
  const packageJson = JSON.parse(
    await readFile(join(packageDirectory, "package.json"), "utf8"),
  );
  const binPath = resolvePackedBin(packageJson);
  const invocation = await runCapturedCommand(
    process.execPath,
    [
      join(packageDirectory, binPath),
      "ask",
      "Hey Jarvis, can you check my calendar for the date of the upcoming wedding please?",
    ],
    packageDirectory,
    {
      ...process.env,
      PERSONAL_AI_FIXED_NOW: "2026-06-26T09:00:00.000Z",
    },
    smokeDirectory,
  );
  const expectedOutput = "Upcoming wedding is on 12 September, all day.\n";
  if (
    invocation.exitCode !== 0 ||
    invocation.stdout !== expectedOutput ||
    invocation.stderr.length > 0
  ) {
    throw new Error(
      [
        "Unexpected packed personal-ai CLI behavior.",
        `Exit code: ${invocation.exitCode}`,
        `Expected stdout: ${expectedOutput}`,
        `Actual stdout: ${invocation.stdout}`,
        `Actual stderr: ${invocation.stderr}`,
      ].join("\n"),
    );
  }
} finally {
  await rm(smokeDirectory, { force: true, recursive: true });
}

function runCommand(command, args, cwd, env = process.env) {
  return new Promise((resolveCommand, rejectCommand) => {
    const child = spawn(command, args, { cwd, env, stdio: "ignore" });
    child.once("error", rejectCommand);
    child.once("close", (exitCode) => resolveCommand({ exitCode }));
  });
}

async function runCapturedCommand(command, args, cwd, env, outputDirectory) {
  const stdoutPath = join(outputDirectory, "stdout.txt");
  const stderrPath = join(outputDirectory, "stderr.txt");
  const stdoutFile = await open(stdoutPath, "w");
  const stderrFile = await open(stderrPath, "w");
  let result;
  try {
    result = await new Promise((resolveCommand, rejectCommand) => {
      const child = spawn(command, args, {
        cwd,
        env,
        stdio: ["ignore", stdoutFile.fd, stderrFile.fd],
      });
      child.once("error", rejectCommand);
      child.once("close", (exitCode) => resolveCommand({ exitCode }));
    });
  } finally {
    await Promise.all([stdoutFile.close(), stderrFile.close()]);
  }
  return {
    ...result,
    stderr: await readFile(stderrPath, "utf8"),
    stdout: await readFile(stdoutPath, "utf8"),
  };
}

function assertSucceeded(label, result) {
  if (result.exitCode === 0) return;
  throw new Error(`${label} failed with exit code ${result.exitCode}.`);
}

function resolveTarballName(entries) {
  const tarballs = entries.filter((entry) => entry.endsWith(".tgz"));
  if (tarballs.length !== 1) {
    throw new Error("npm pack did not create exactly one tarball.");
  }
  return tarballs[0];
}

function resolvePackedBin(packageJson) {
  if (
    typeof packageJson !== "object" ||
    packageJson === null ||
    Array.isArray(packageJson)
  ) {
    throw new Error("Packed package.json must contain an object.");
  }
  const bin = packageJson.bin;
  const binPath =
    typeof bin === "object" && bin !== null && !Array.isArray(bin)
      ? bin["personal-ai"]
      : undefined;
  if (typeof binPath !== "string" || binPath.length === 0) {
    throw new Error("Packed package does not declare the personal-ai bin.");
  }
  return binPath;
}
