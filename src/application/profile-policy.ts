import { containsControlCharacters } from "./text-safety.js";
import {
  isCanonicalIsoDate,
  isCanonicalTimeZoneIdentifier,
  parseCanonicalIsoDate,
} from "./temporal-policy.js";
import { zonedParts } from "./local-date-time.js";
import type {
  ProfileFact,
  ProfileField,
  ProfileResponseStyle,
} from "../ports/profile-store.js";
import { profileFields } from "../ports/profile-store.js";

export interface ProfileValueValidationContext {
  now: Date;
}

export const maximumProfileInterests = 20;

export function isProfileField(value: string): value is ProfileField {
  return profileFields.some((field) => field === value);
}

export function isSingletonProfileField(
  field: ProfileField,
): field is Exclude<ProfileField, "interest"> {
  return field !== "interest";
}

export function normalizeProfileValue(
  field: ProfileField,
  value: string,
  context: ProfileValueValidationContext,
): string {
  const normalized = normalizeWhitespace(value);

  switch (field) {
    case "preferredName":
      return requireSafeText(normalized, field, 80);
    case "birthDate":
      return requireBirthDate(normalized, context.now);
    case "pronouns":
      return requirePronouns(normalized);
    case "homeTimeZone":
      if (!isCanonicalTimeZoneIdentifier(normalized)) {
        throw invalidProfileValue(field);
      }
      return normalized;
    case "homeLocation":
      return requireSafeText(normalized, field, 160);
    case "interest":
      return requireSafeText(normalized, field, 80);
    case "responseStyle": {
      const style = normalized.toLowerCase();
      if (!isProfileResponseStyle(style)) throw invalidProfileValue(field);
      return style;
    }
  }
}

export function calculateAge(
  birthDate: string,
  now: Date,
  timeZone: string,
): number {
  const birth = parseCanonicalIsoDate(birthDate);
  if (!birth) throw invalidProfileValue("birthDate");
  const current = zonedParts(now, timeZone);
  const birthdayPassed =
    current.month > birth.month ||
    (current.month === birth.month && current.day >= birth.day);
  return current.year - birth.year - (birthdayPassed ? 0 : 1);
}

export function assertValidProfileFact(fact: ProfileFact): void {
  if (
    !isProfileField(fact.field) ||
    fact.provenance !== "user-authored" ||
    !isCanonicalTimestamp(fact.createdAt) ||
    !isCanonicalTimestamp(fact.updatedAt) ||
    fact.updatedAt < fact.createdAt ||
    normalizeProfileValue(fact.field, fact.value, {
      now: new Date(fact.updatedAt),
    }) !== fact.value
  ) {
    throw new Error("Profile fact state is invalid.");
  }
}

export function cloneProfileFact(fact: ProfileFact): ProfileFact {
  return { ...fact };
}

export function normalizeProfileMatchValue(value: string): string {
  return normalizeWhitespace(value).toLocaleLowerCase("en");
}

function requireBirthDate(value: string, now: Date): string {
  if (!isCanonicalIsoDate(value)) throw invalidProfileValue("birthDate");
  const today = zonedParts(now, "UTC");
  const todayText = `${String(today.year).padStart(4, "0")}-${String(today.month).padStart(2, "0")}-${String(today.day).padStart(2, "0")}`;
  if (value > todayText) throw invalidProfileValue("birthDate");
  return value;
}

function requirePronouns(value: string): string {
  const normalized = value.replace(/\s*\/\s*/gu, "/");
  if (
    normalized.length === 0 ||
    normalized.length > 40 ||
    containsControlCharacters(normalized) ||
    !/^[\p{L}\p{M}'’.-]+(?:\/[\p{L}\p{M}'’.-]+){1,3}$/u.test(normalized)
  ) {
    throw invalidProfileValue("pronouns");
  }
  return normalized;
}

function requireSafeText(
  value: string,
  field: ProfileField,
  maximumLength: number,
): string {
  if (
    value.length === 0 ||
    value.length > maximumLength ||
    containsControlCharacters(value) ||
    /https?:\/\/|\bwww\.|\[[^\]]+\]\([^)]+\)/iu.test(value)
  ) {
    throw invalidProfileValue(field);
  }
  return value;
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}

function isProfileResponseStyle(value: string): value is ProfileResponseStyle {
  return value === "balanced" || value === "concise" || value === "detailed";
}

function isCanonicalTimestamp(value: string): boolean {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

function invalidProfileValue(field: ProfileField): Error {
  return new Error(`Profile ${field} value is invalid.`);
}
