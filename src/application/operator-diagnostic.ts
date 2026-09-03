import type {
  OperatorDiagnosticProjection,
  OperatorDiagnosticTextTail,
} from "../ports/operator-diagnostic.js";
import { containsControlCharacters } from "./text-safety.js";

const maximumCommandTailCharacters = 2_000;
const maximumRequestIdCharacters = 256;

export function quoteOperatorDiagnosticString(value: string): string {
  return JSON.stringify(value).replace(
    /[\u007f-\u009f\u2028\u2029]/gu,
    (character) =>
      `\\u${character.codePointAt(0)!.toString(16).padStart(4, "0")}`,
  );
}

export function readOperatorDiagnosticProjection(
  value: unknown,
): OperatorDiagnosticProjection | undefined {
  if (!isRecord(value) || !isRecord(value.operatorDiagnostic)) return;
  const projection = value.operatorDiagnostic;
  if (projection.kind === "command") return readCommandProjection(projection);
  if (projection.kind === "provider") return readProviderProjection(projection);
  return;
}

function readCommandProjection(
  value: Readonly<Record<string, unknown>>,
): Extract<OperatorDiagnosticProjection, { kind: "command" }> | undefined {
  const exitCode = readOptionalExitCode(value.exitCode);
  const timeoutMs = readOptionalPositiveInteger(value.timeoutMs);
  const stderr = readTextTail(value.stderr);
  const stdout = readTextTail(value.stdout);
  if (
    exitCode === invalid ||
    timeoutMs === invalid ||
    stderr === invalid ||
    stdout === invalid
  ) {
    return;
  }
  return Object.freeze({
    kind: "command" as const,
    ...(exitCode === undefined ? {} : { exitCode }),
    ...(stderr ? { stderr } : {}),
    ...(stdout ? { stdout } : {}),
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  });
}

function readProviderProjection(
  value: Readonly<Record<string, unknown>>,
): Extract<OperatorDiagnosticProjection, { kind: "provider" }> | undefined {
  const requestId = readRequestId(value.requestId);
  const responseBodyBytes = readOptionalNonNegativeInteger(
    value.responseBodyBytes,
  );
  const status = readOptionalPositiveInteger(value.status);
  if (
    requestId === invalid ||
    responseBodyBytes === invalid ||
    status === invalid
  ) {
    return;
  }
  return Object.freeze({
    kind: "provider" as const,
    ...(requestId ? { requestId } : {}),
    ...(responseBodyBytes === undefined ? {} : { responseBodyBytes }),
    ...(status === undefined ? {} : { status }),
  });
}

function readTextTail(
  value: unknown,
): OperatorDiagnosticTextTail | typeof invalid | undefined {
  if (value === undefined) return;
  if (
    !isRecord(value) ||
    typeof value.tail !== "string" ||
    typeof value.truncated !== "boolean"
  ) {
    return invalid;
  }
  const tail = value.tail.slice(-maximumCommandTailCharacters);
  return Object.freeze({
    tail,
    truncated:
      value.truncated || value.tail.length > maximumCommandTailCharacters,
  });
}

function readRequestId(value: unknown): string | typeof invalid | undefined {
  if (value === undefined) return;
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= maximumRequestIdCharacters &&
    !containsControlCharacters(value)
    ? value
    : invalid;
}

function readOptionalExitCode(
  value: unknown,
): number | null | typeof invalid | undefined {
  if (value === undefined || value === null) return value;
  return Number.isInteger(value) ? (value as number) : invalid;
}

function readOptionalPositiveInteger(
  value: unknown,
): number | typeof invalid | undefined {
  if (value === undefined) return;
  return Number.isInteger(value) && (value as number) > 0
    ? (value as number)
    : invalid;
}

function readOptionalNonNegativeInteger(
  value: unknown,
): number | typeof invalid | undefined {
  if (value === undefined) return;
  return Number.isInteger(value) && (value as number) >= 0
    ? (value as number)
    : invalid;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

const invalid = Symbol("invalid operator diagnostic field");
