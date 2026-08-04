import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AlarmRecord } from "../ports/alarm-store.js";
import {
  assertValidAlarmRecord,
  type AlarmRecordCandidate,
} from "../adapters/local/alarm-record.js";

export const deterministicTestNow = new Date("2026-06-26T09:00:00.000Z");
export const deterministicTestNowIso = deterministicTestNow.toISOString();

export function createScheduledAlarmRecord(
  input: Pick<AlarmRecordCandidate, "id" | "label" | "scheduledFor"> &
    Partial<
      Omit<
        AlarmRecordCandidate,
        "id" | "label" | "nextDeliveryAt" | "scheduledFor" | "terminalAt"
      >
    > & {
      nextDeliveryAt?: string | undefined;
      terminalAt?: string | undefined;
    },
): AlarmRecord {
  const { nextDeliveryAt, terminalAt, updatedAt, ...recordInput } = input;
  const record: AlarmRecordCandidate = {
    createdAt: deterministicTestNowIso,
    deliveryAttempts: 0,
    ...("nextDeliveryAt" in input
      ? nextDeliveryAt === undefined
        ? {}
        : { nextDeliveryAt }
      : { nextDeliveryAt: input.scheduledFor }),
    revision: 1,
    status: "scheduled",
    successfulDeliveries: 0,
    updatedAt: updatedAt ?? terminalAt ?? deterministicTestNowIso,
    ...recordInput,
    ...(terminalAt === undefined ? {} : { terminalAt }),
  };
  assertValidAlarmRecord(record);
  return record;
}

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
