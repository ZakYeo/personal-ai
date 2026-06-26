import {
  createFeatureCommand,
  createFeatureContext,
  expectCapabilityMetadata,
  expectFeatureExecution,
  expectFeatureHandles,
  expectFeatureRejects,
  featureContractNow,
} from "./feature-contract.js";
import type { FeaturePlugin } from "../ports/feature.js";

describe("feature contract test support", () => {
  it("creates feature contexts with a fixed clock and default config", () => {
    const context = createFeatureContext();

    expect(context.clock.now()).toEqual(featureContractNow);
    expect(context.config).toEqual({
      assistant: {
        name: "Jarvis",
        wakePhrases: ["hey jarvis"],
      },
      features: {
        test: { enabled: true },
      },
    });
  });

  it("asserts capability metadata and feature behavior", async () => {
    const feature = createFeature({
      capabilities: [
        {
          name: "test.echo",
          risk: "low",
          parameters: { message: { type: "string", required: true } },
        },
      ],
      execute: (command) => {
        if (command.parameters.message === "fail") {
          return Promise.reject(new Error("fixture failure"));
        }

        return Promise.resolve({ text: String(command.parameters.message) });
      },
    });

    expectCapabilityMetadata(feature, {
      name: "test.echo",
      risk: "low",
      parameters: { message: { type: "string", required: true } },
    });
    expectFeatureHandles(feature, "test.echo", "calendar.search_events");
    await expectFeatureExecution(
      feature,
      createFeatureCommand("test.echo", { message: "hello" }),
      { message: "hello" },
      { text: "hello" },
    );
    await expectFeatureRejects(
      feature,
      createFeatureCommand("test.echo", { message: "fail" }),
      { message: "fail" },
      "fixture failure",
    );
  });
});

function createFeature(
  overrides: Pick<FeaturePlugin, "capabilities" | "execute"> &
    Pick<Partial<FeaturePlugin>, "canHandle">,
): FeaturePlugin {
  return {
    id: "test",
    displayName: "Test",
    ...overrides,
  };
}
