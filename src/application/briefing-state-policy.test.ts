import type { BriefingDeliverySlot } from "../ports/briefing.js";
import { pruneBriefingDeliverySlots } from "./briefing-state-policy.js";

describe("pruneBriefingDeliverySlots", () => {
  it("retains the exact cutoff and removes only older delivery state", () => {
    const slots: BriefingDeliverySlot[] = [
      {
        id: "older",
        skippedAt: "2026-07-21T11:59:59.999Z",
        status: "skipped",
      },
      {
        id: "cutoff",
        skippedAt: "2026-07-21T12:00:00.000Z",
        status: "skipped",
      },
      {
        claimedAt: "2026-09-04T11:00:00.000Z",
        deliveredAt: "2026-09-04T12:00:00.000Z",
        id: "recent",
        status: "delivered",
      },
    ];

    expect(
      pruneBriefingDeliverySlots(
        slots,
        new Date("2026-09-04T12:00:00.000Z"),
      ).map(({ id }) => id),
    ).toEqual(["cutoff", "recent"]);
  });
});
