import {
  bindRuntimeService,
  createRuntimeServiceRegistry,
  defineRuntimeServiceToken,
} from "./runtime-service-registry.js";

describe("runtime service registry", () => {
  it("resolves values through typed tokens", () => {
    const token = defineRuntimeServiceToken<{ value: string }>("test service");
    const value = { value: "available" };
    const registry = createRuntimeServiceRegistry([
      bindRuntimeService(token, value),
    ]);

    expect(registry.get(token)).toBe(value);
    expect(registry.require(token)).toBe(value);
  });

  it("returns undefined for an absent optional service", () => {
    const token = defineRuntimeServiceToken<string>("absent service");

    expect(createRuntimeServiceRegistry([]).get(token)).toBeUndefined();
  });

  it("rejects duplicate providers for one stable service token", () => {
    const token = defineRuntimeServiceToken<string>("duplicate service");

    expect(() =>
      createRuntimeServiceRegistry([
        bindRuntimeService(token, "first"),
        bindRuntimeService(token, "second"),
      ]),
    ).toThrow('Runtime service "duplicate service" has multiple providers.');
  });
});
