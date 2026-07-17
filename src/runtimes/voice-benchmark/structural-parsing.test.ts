import {
  requireArray,
  requireNonEmptyString,
  requirePositiveInteger,
  requireRecord,
  requireSha256Digest,
  requireStableId,
  requireString,
} from "./structural-parsing.js";

describe("voice benchmark structural parsing", () => {
  it("distinguishes records, arrays, and strings", () => {
    expect(requireRecord({ value: 1 }, "record")).toEqual({ value: 1 });
    expect(requireArray([1], "items")).toEqual([1]);
    expect(requireString("", "transcript")).toBe("");
    expect(() => requireRecord([], "record")).toThrow(
      "record must be an object.",
    );
    expect(() => requireArray({}, "items")).toThrow("items must be an array.");
  });

  it("rejects empty benchmark identifiers and strings consistently", () => {
    expect(() => requireNonEmptyString("   ", "name")).toThrow(
      "name must be a nonempty string.",
    );
    expect(requireStableId("alarm-list_v1", "id")).toBe("alarm-list_v1");
    expect(() => requireStableId("Alarm List", "id")).toThrow(
      "id must be a stable lowercase identifier.",
    );
  });

  it("validates shared digest and integer primitives", () => {
    const digest = "a".repeat(64);
    expect(requireSha256Digest(digest, "sha256")).toBe(digest);
    expect(() => requireSha256Digest("bad", "sha256")).toThrow(
      "sha256 must be a SHA-256 digest.",
    );
    expect(requirePositiveInteger(1, "count")).toBe(1);
    expect(() =>
      requirePositiveInteger(Number.MAX_SAFE_INTEGER + 1, "count"),
    ).toThrow("count must be a positive safe integer.");
  });
});
