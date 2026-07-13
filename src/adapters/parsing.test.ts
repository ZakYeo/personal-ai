import { isRecord } from "./parsing.js";

describe("adapter parsing primitives", () => {
  it("accepts only non-array object records", () => {
    expect(isRecord({ value: true })).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
    expect(isRecord("value")).toBe(false);
  });
});
