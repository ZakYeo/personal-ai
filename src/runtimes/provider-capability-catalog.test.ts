import type { FeaturePlugin } from "../ports/feature.js";
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
      },
      {
        capability: features[0]?.capabilities[1],
        featureId: "calendar",
        featureName: "Calendar",
      },
      {
        capability: features[1]?.capabilities[0],
        featureId: "messaging",
        featureName: "Messaging",
      },
    ]);
  });
});
