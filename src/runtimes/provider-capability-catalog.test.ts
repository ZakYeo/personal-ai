import type { FeaturePlugin } from "../ports/feature.js";
import { createCapabilityRoutingIndex } from "../ports/capability-catalog.js";
import { createProviderCapabilityCatalog } from "./provider-capability-catalog.js";

describe("createProviderCapabilityCatalog", () => {
  it("maps enabled feature metadata to provider-facing capability entries", () => {
    const features: FeaturePlugin[] = [
      {
        capabilities: [
          {
            name: "calendar.create",
            parameters: {
              title: { required: true, type: "string" },
            },
            risk: "low",
          },
          {
            name: "calendar.delete",
            risk: "high",
          },
        ],
        displayName: "Calendar",
        execute: vi.fn(),
        id: "calendar",
      },
      {
        capabilities: [
          {
            name: "message.send",
            risk: "high",
          },
        ],
        displayName: "Messaging",
        execute: vi.fn(),
        id: "messaging",
      },
    ];

    expect(createProviderCapabilityCatalog(features)).toEqual([
      {
        capability: features[0]?.capabilities[0],
        featureId: "calendar",
        featureName: "Calendar",
        parameterText: "title: string (required)",
      },
      {
        capability: features[0]?.capabilities[1],
        featureId: "calendar",
        featureName: "Calendar",
        parameterText: "none",
      },
      {
        capability: features[1]?.capabilities[0],
        featureId: "messaging",
        featureName: "Messaging",
        parameterText: "none",
      },
    ]);
  });

  it("rejects duplicate capability ownership", () => {
    const first = createFeature("calendar", "shared.lookup");
    const second = createFeature("messaging", "shared.lookup");

    expect(() => createProviderCapabilityCatalog([first, second])).toThrow(
      'Capability "shared.lookup" is declared by both "calendar" and "messaging".',
    );
  });

  it("returns an immutable compiled catalog", () => {
    const catalog = createProviderCapabilityCatalog([
      createFeature("calendar", "calendar.list"),
    ]);

    expect(Object.isFrozen(catalog)).toBe(true);
    expect(Object.isFrozen(catalog[0])).toBe(true);
    expect(Object.isFrozen(catalog[0]?.capability)).toBe(true);
    expect(() => {
      (catalog as unknown[]).push({
        capability: { name: "calendar.delete", risk: "high" },
      });
    }).toThrow();
  });

  it("shares one frozen capability between routing and provider metadata", () => {
    const feature = createFeature("calendar", "calendar.list");
    const routing = createCapabilityRoutingIndex([feature]);
    const catalogCapability = routing.catalog[0]?.capability;
    const routedCapability = routing.get("calendar.list")?.capability;

    expect(routedCapability).toBe(catalogCapability);
    expect(Object.isFrozen(routedCapability)).toBe(true);

    feature.capabilities[0]!.risk = "high";
    expect(routedCapability?.risk).toBe("low");
  });
});

function createFeature(id: string, capabilityName: string): FeaturePlugin {
  return {
    capabilities: [{ name: capabilityName, risk: "low" }],
    displayName: id,
    execute: vi.fn(),
    id,
  };
}
