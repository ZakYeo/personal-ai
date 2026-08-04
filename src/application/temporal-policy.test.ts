import {
  isCanonicalTimeZoneIdentifier,
  parseCanonicalIsoDate,
  resolveTimeZoneIdentifier,
} from "./temporal-policy.js";

describe("temporal policy", () => {
  it("parses canonical ISO dates once for policy consumers", () => {
    expect(parseCanonicalIsoDate("2028-02-29")).toEqual({
      day: 29,
      month: 2,
      year: 2028,
    });
    expect(parseCanonicalIsoDate("2027-02-29")).toBeUndefined();
    expect(parseCanonicalIsoDate("2028-2-29")).toBeUndefined();
  });

  it("distinguishes resolving a timezone alias from requiring a canonical identifier", () => {
    expect(resolveTimeZoneIdentifier("US/Pacific")).toBe("America/Los_Angeles");
    expect(isCanonicalTimeZoneIdentifier("US/Pacific")).toBe(false);
    expect(isCanonicalTimeZoneIdentifier("America/Los_Angeles")).toBe(true);
    expect(resolveTimeZoneIdentifier("Not/A_Real_Zone")).toBeUndefined();
  });
});
