import {
  selectConfiguredRuntimeEntry,
  selectConfiguredRuntimeEntryWithId,
} from "./runtime-selector.js";

describe("selectConfiguredRuntimeEntry", () => {
  it("selects registered entries by configured ID", () => {
    expect(
      selectConfiguredRuntimeEntry({
        configuredId: "mock",
        missingMessage: "Config adapter must be configured.",
        registry: {
          mock: "adapter",
        },
        unknownMessage: (adapterId) =>
          `Config adapter "${adapterId}" is not registered.`,
      }),
    ).toBe("adapter");
  });

  it("returns the configured ID with the selected entry when requested", () => {
    expect(
      selectConfiguredRuntimeEntryWithId({
        configuredId: "mock",
        missingMessage: "Config adapter must be configured.",
        registry: { mock: "adapter" },
        unknownMessage: (adapterId) =>
          `Config adapter "${adapterId}" is not registered.`,
      }),
    ).toEqual({ configuredId: "mock", entry: "adapter" });
  });

  it("rejects missing configured IDs", () => {
    expect(() =>
      selectConfiguredRuntimeEntry({
        configuredId: undefined,
        missingMessage: "Config adapter must be configured.",
        registry: {},
        unknownMessage: (adapterId) =>
          `Config adapter "${adapterId}" is not registered.`,
      }),
    ).toThrow("Config adapter must be configured.");
  });

  it("rejects unregistered configured IDs", () => {
    expect(() =>
      selectConfiguredRuntimeEntry({
        configuredId: "unknown",
        missingMessage: "Config adapter must be configured.",
        registry: {},
        unknownMessage: (adapterId) =>
          `Config adapter "${adapterId}" is not registered.`,
      }),
    ).toThrow('Config adapter "unknown" is not registered.');
  });
});
