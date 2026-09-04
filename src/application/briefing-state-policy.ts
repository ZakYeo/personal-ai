import type {
  BriefingDeliverySlot,
  BriefingPreferences,
  BriefingSnapshot,
} from "../ports/briefing.js";

const deliverySlotRetentionMs = 45 * 24 * 60 * 60_000;
const maximumDeliverySlots = 100;

export function createDefaultBriefingPreferences(
  now: Date,
): BriefingPreferences {
  return {
    length: "standard",
    quietHours: { end: "07:00", start: "22:00" },
    revision: 1,
    searchTopics: [],
    sections: ["profile", "calendar", "weather", "alarms", "tasks"],
    updatedAt: now.toISOString(),
  };
}

export function pruneBriefingDeliverySlots(
  slots: readonly BriefingDeliverySlot[],
  now: Date,
): BriefingDeliverySlot[] {
  const cutoff = new Date(
    now.getTime() - deliverySlotRetentionMs,
  ).toISOString();
  return slots
    .filter((slot) => deliverySlotTimestamp(slot) >= cutoff)
    .slice(-maximumDeliverySlots)
    .map((slot) => ({ ...slot }));
}

export function cloneBriefingPreferences(
  value: BriefingPreferences,
): BriefingPreferences {
  return structuredClone(value);
}

export function cloneBriefingSnapshot(
  value: BriefingSnapshot,
): BriefingSnapshot;
export function cloneBriefingSnapshot(value: undefined): undefined;
export function cloneBriefingSnapshot(
  value: BriefingSnapshot | undefined,
): BriefingSnapshot | undefined;
export function cloneBriefingSnapshot(
  value: BriefingSnapshot | undefined,
): BriefingSnapshot | undefined {
  return value === undefined ? undefined : structuredClone(value);
}

function deliverySlotTimestamp(slot: BriefingDeliverySlot): string {
  if (slot.status === "skipped") return slot.skippedAt;
  return slot.status === "delivered" ? slot.deliveredAt : slot.claimedAt;
}
