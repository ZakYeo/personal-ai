#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter } from "node:path";
import { fileURLToPath } from "node:url";

interface PiQemuSmokeOptions {
  configPath: string;
  cpus: number;
  dtbPath: string;
  imagePath: string;
  kernelPath: string;
  memoryMb: number;
  mode: "print" | "run";
  qemuBinary: string;
  sshPort: number;
}

interface PiQemuSmokeIo {
  stderr: Pick<NodeJS.WriteStream, "write">;
  stdout: Pick<NodeJS.WriteStream, "write">;
}

interface PiQemuSmokeDependencies extends PiQemuSmokeIo {
  commandExists?: (command: string) => boolean;
  fileExists?: (path: string) => boolean;
  spawn?: (command: string, args: string[]) => Promise<number>;
}

const defaultOptions = {
  cpus: 4,
  memoryMb: 1024,
  mode: "print",
  qemuBinary: "qemu-system-aarch64",
  sshPort: 2222,
} as const;

export async function runPiQemuSmoke(
  args: string[] = process.argv.slice(2),
  dependencies: PiQemuSmokeDependencies = {
    stderr: process.stderr,
    stdout: process.stdout,
  },
): Promise<number> {
  try {
    const options = parsePiQemuSmokeArgs(args);

    preflightPiQemuSmoke(options, dependencies);

    const qemuArgs = buildPiQemuArgs(options);

    if (options.mode === "print") {
      dependencies.stdout.write(
        `${formatCommand(options.qemuBinary, qemuArgs)}\n`,
      );
      dependencies.stdout.write(
        `After the guest boots, run: npm run cli -- pi-service --config ${options.configPath}\n`,
      );

      return 0;
    }

    return await (dependencies.spawn ?? spawnQemu)(
      options.qemuBinary,
      qemuArgs,
    );
  } catch (error) {
    dependencies.stderr.write(
      `Pi QEMU smoke failure: ${error instanceof Error ? error.message : String(error)}\n`,
    );

    return 1;
  }
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = await runPiQemuSmoke();
}

function parsePiQemuSmokeArgs(args: string[]): PiQemuSmokeOptions {
  const parsed: Partial<PiQemuSmokeOptions> = { ...defaultOptions };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg) {
      throw new Error("Option is required.");
    }

    if (arg === "--run") {
      parsed.mode = "run";
      continue;
    }

    if (arg === "--print") {
      parsed.mode = "print";
      continue;
    }

    const value = args[index + 1];

    if (!value) {
      throw new Error(`${arg ?? "Option"} requires a value.`);
    }

    switch (arg) {
      case "--config": {
        parsed.configPath = value;
        break;
      }
      case "--cpus": {
        parsed.cpus = parsePositiveInteger("--cpus", value);
        break;
      }
      case "--dtb": {
        parsed.dtbPath = value;
        break;
      }
      case "--image": {
        parsed.imagePath = value;
        break;
      }
      case "--kernel": {
        parsed.kernelPath = value;
        break;
      }
      case "--memory": {
        parsed.memoryMb = parsePositiveInteger("--memory", value);
        break;
      }
      case "--qemu-binary": {
        parsed.qemuBinary = value;
        break;
      }
      case "--ssh-port": {
        parsed.sshPort = parsePositiveInteger("--ssh-port", value);
        break;
      }
      default: {
        throw new Error(`Unknown option: ${arg ?? ""}`);
      }
    }

    index += 1;
  }

  if (!parsed.configPath) {
    throw new Error("--config is required.");
  }

  if (!parsed.imagePath) {
    throw new Error("--image is required.");
  }

  if (!parsed.kernelPath) {
    throw new Error("--kernel is required.");
  }

  if (!parsed.dtbPath) {
    throw new Error("--dtb is required.");
  }

  return parsed as PiQemuSmokeOptions;
}

function preflightPiQemuSmoke(
  options: PiQemuSmokeOptions,
  dependencies: PiQemuSmokeDependencies,
): void {
  const fileExists = dependencies.fileExists ?? existsSync;

  for (const [label, path] of [
    ["Config path", options.configPath],
    ["Image path", options.imagePath],
    ["Kernel path", options.kernelPath],
    ["DTB path", options.dtbPath],
  ] as const) {
    if (!fileExists(path)) {
      throw new Error(`${label} does not exist: ${path}`);
    }
  }

  if (!(dependencies.commandExists ?? commandExists)(options.qemuBinary)) {
    throw new Error(`QEMU binary is not available: ${options.qemuBinary}`);
  }
}

function buildPiQemuArgs(options: PiQemuSmokeOptions): string[] {
  return [
    "-machine",
    "raspi3b",
    "-m",
    String(options.memoryMb),
    "-smp",
    String(options.cpus),
    "-kernel",
    options.kernelPath,
    "-dtb",
    options.dtbPath,
    "-drive",
    `file=${options.imagePath},format=raw,if=sd`,
    "-append",
    "rw root=/dev/mmcblk0p2 rootwait console=ttyAMA0,115200",
    "-serial",
    "stdio",
    "-netdev",
    `user,id=net0,hostfwd=tcp::${options.sshPort}-:22`,
    "-device",
    "usb-net,netdev=net0",
  ];
}

function parsePositiveInteger(label: string, value: string): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }

  return parsed;
}

function commandExists(command: string): boolean {
  if (command.includes("/")) {
    return existsSync(command);
  }

  const pathValue = process.env.PATH;

  if (!pathValue) {
    return false;
  }

  return pathValue.split(delimiter).some((pathEntry) => {
    return existsSync(`${pathEntry}/${command}`);
  });
}

function spawnQemu(command: string, args: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });

    child.once("error", reject);
    child.once("close", (exitCode) => {
      resolve(exitCode ?? 1);
    });
  });
}

function formatCommand(command: string, args: string[]): string {
  return [command, ...args].map(quoteShellArg).join(" ");
}

function quoteShellArg(value: string): string {
  if (/^[\w./:=,+-]+$/u.test(value)) {
    return value;
  }

  return `"${value.replaceAll('"', '\\"')}"`;
}
