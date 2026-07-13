import { enabledDeterministicConfig } from "../../test-support/deterministic-runtime-fixtures.js";
import { resolveRuntimeConfigSource } from "./runtime-config-source.js";

describe("resolveRuntimeConfigSource", () => {
  it("keeps directly injected config and its explicit directory", async () => {
    const load = vi.fn();

    await expect(
      resolveRuntimeConfigSource({
        config: enabledDeterministicConfig,
        configDirectory: "/etc/personal-ai",
        load,
      }),
    ).resolves.toEqual({
      config: enabledDeterministicConfig,
      configDirectory: "/etc/personal-ai",
    });
    expect(load).not.toHaveBeenCalled();
  });

  it("loads config and source context when parsed config is absent", async () => {
    const loaded = {
      config: enabledDeterministicConfig,
      configDirectory: "/config",
    };

    await expect(
      resolveRuntimeConfigSource({ load: () => Promise.resolve(loaded) }),
    ).resolves.toBe(loaded);
  });

  it("rejects a relative injected config directory", async () => {
    await expect(
      resolveRuntimeConfigSource({
        config: enabledDeterministicConfig,
        configDirectory: "config",
        load: vi.fn(),
      }),
    ).rejects.toThrow("Runtime config directory must be absolute.");
  });

  it("rejects a relative directory returned by a config loader", async () => {
    await expect(
      resolveRuntimeConfigSource({
        load: () =>
          Promise.resolve({
            config: enabledDeterministicConfig,
            configDirectory: "config",
          }),
      }),
    ).rejects.toThrow("Runtime config directory must be absolute.");
  });
});
