import {
  createFeatureCommand,
  createFeatureContext,
  expectCapabilityMetadata,
  expectFeatureExecution,
  expectFeatureHandles,
  expectFeatureRejects,
  featureContractNow,
} from "./feature-contract.js";
import { defineCapability, defineFeature } from "../ports/feature.js";

describe("feature contract test support", () => {
  it("creates feature contexts with a fixed clock and default config", () => {
    const context = createFeatureContext();

    expect(context.clock.now()).toEqual(featureContractNow);
    expect(context.config).toEqual({
      assistant: {
        name: "Jarvis",
        wakePhrases: ["hey jarvis"],
      },
      intent: {
        provider: "deterministic",
      },
      features: {
        test: { enabled: true },
      },
    });
  });

  it("asserts capability metadata and feature behavior", async () => {
    const feature = createFeature({
      execute: (request) => {
        if (request.args.message === "fail") {
          return Promise.reject(new Error("fixture failure"));
        }

        return Promise.resolve({
          text: request.args.message,
        });
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

function createFeature(overrides: {
  execute: Parameters<
    typeof defineCapability<{
      message: { type: "string"; required: true };
    }>
  >[0]["execute"];
}) {
  return defineFeature({
    id: "test",
    displayName: "Test",
    capabilities: {
      "test.echo": defineCapability({
        risk: "low",
        parameters: { message: { type: "string", required: true } },
        execute: overrides.execute,
      }),
    },
  });
}
