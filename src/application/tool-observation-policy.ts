import type { AssistantToolObservation } from "../ports/intent.js";
import { containsControlCharacters } from "./text-safety.js";

export const toolObservationLimits = Object.freeze({
  dataFields: 24,
  serializedCharacters: 12_000,
  stringCharacters: 512,
  textCharacters: 4_000,
});

export function assertToolObservationWithinLimit(
  observation: AssistantToolObservation,
): void {
  const dataEntries = Object.entries(observation.data ?? {});
  if (
    observation.text.length > toolObservationLimits.textCharacters ||
    containsControlCharacters(observation.text) ||
    dataEntries.length > toolObservationLimits.dataFields ||
    dataEntries.some(
      ([key, value]) =>
        key.length === 0 ||
        key.length > toolObservationLimits.stringCharacters ||
        containsControlCharacters(key) ||
        (typeof value === "string" && !isSafeBoundedString(value)),
    ) ||
    !allNestedStringsAreBounded(observation.resultReferences ?? []) ||
    JSON.stringify(observation).length >
      toolObservationLimits.serializedCharacters
  ) {
    throw new Error("A tool observation exceeded its application limit.");
  }
}

function allNestedStringsAreBounded(value: unknown): boolean {
  if (typeof value === "string") return isSafeBoundedString(value);
  if (Array.isArray(value)) return value.every(allNestedStringsAreBounded);
  if (value !== null && typeof value === "object") {
    return Object.entries(value).every(
      ([key, nested]) =>
        isSafeBoundedString(key) && allNestedStringsAreBounded(nested),
    );
  }
  return true;
}

function isSafeBoundedString(value: string): boolean {
  return (
    value.length <= toolObservationLimits.stringCharacters &&
    !containsControlCharacters(value)
  );
}
