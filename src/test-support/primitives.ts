import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const deterministicTestNow = new Date("2026-06-26T09:00:00.000Z");
export const deterministicTestNowIso = deterministicTestNow.toISOString();

interface CapturedWriter {
  write(chunk: string): void;
  writes: string[];
}

export function createCapturedWriter(
  initialWrites: string[] = [],
): CapturedWriter {
  return {
    write: (chunk) => {
      initialWrites.push(chunk);
    },
    writes: initialWrites,
  };
}

export async function writeTempJsonFile(
  value: unknown,
  prefix = "personal-ai-test-",
  filename = "config.json",
): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  const filePath = join(directory, filename);

  await writeFile(filePath, JSON.stringify(value));

  return filePath;
}

export function line(text: string): string {
  return `${text}\n`;
}
