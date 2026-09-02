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
            parameters: {
              query: {
                allowedValues: ["active", "archived"],
                required: true,
                type: "string",
              },
            },
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
    const queryParameter = route.capability.parameters!.query!;
    expect(queryParameter.type).toBe("string");
    if (queryParameter.type !== "string") throw new Error("unreachable");
    expect(Reflect.set(queryParameter.allowedValues!, "2", "all")).toBe(false);
    expect(() => {
      // @ts-expect-error Compiled feature capability arrays are readonly.
      route.feature.capabilities.push(route.capability);
    }).toThrow(TypeError);
    expect(routing.catalog[0]?.parameterText).toContain(
      "allowed active | archived",
    );
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
