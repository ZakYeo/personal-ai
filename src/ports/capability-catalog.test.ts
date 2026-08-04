import type {
  CapabilityCatalog,
  FeatureCapability,
} from "./capability-catalog.js";
import { createCapabilityRoutingIndex } from "../application/capability-catalog.js";

describe("createCapabilityRoutingIndex", () => {
  it("deeply freezes compiled capability and feature metadata", () => {
    const routing = createCapabilityRoutingIndex([
      {
        capabilities: [
          {
            name: "notes.list",
            parameters: { query: { required: true, type: "string" } },
            risk: "low",
          },
        ],
        displayName: "Notes",
        id: "notes",
      },
    ]);
    const route = routing.get("notes.list")!;

    expect(() => {
      // @ts-expect-error Compiled catalog entries are readonly.
      routing.catalog[0]!.featureId = "changed";
    }).toThrow(TypeError);
    expect(() => {
      // @ts-expect-error Compiled capability parameters are readonly.
      route.capability.parameters!.query!.required = false;
    }).toThrow(TypeError);
    expect(() => {
      // @ts-expect-error Compiled feature capability arrays are readonly.
      route.feature.capabilities.push(route.capability);
    }).toThrow(TypeError);
  });

  it("exposes deeply readonly catalog types", () => {
    const capability: FeatureCapability = { name: "notes.list", risk: "low" };
    const catalog: CapabilityCatalog = [
      {
        capability,
        featureId: "notes",
        featureName: "Notes",
        parameterText: "none",
      },
    ];

    expect(capability.name).toBe("notes.list");
    expect(catalog[0]?.featureId).toBe("notes");
  });
});
