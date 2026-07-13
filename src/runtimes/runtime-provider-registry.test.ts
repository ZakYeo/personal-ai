import { defineConfiglessRuntimeProvider } from "./runtime-provider-registry.js";

describe("runtime provider registry", () => {
  it("defines configless providers whose factories receive only context", () => {
    const create = vi.fn((context: { label: string }) => context.label);
    const provider = defineConfiglessRuntimeProvider(create);
    const resolved = provider.resolve({ ignored: { config: true } });

    expect(resolved.create({ label: "deterministic" })).toBe("deterministic");
    expect(create).toHaveBeenCalledExactlyOnceWith({
      label: "deterministic",
    });
  });
});
