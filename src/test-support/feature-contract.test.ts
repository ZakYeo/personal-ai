import {
  createFeatureContext,
  expectCapabilityMetadata,
  expectFeatureExecution,
  expectFeatureHandles,
  expectFeatureRejects,
} from "./feature-contract.js";
import { createCommand, createFeature } from "./core-assistant.js";

describe("feature contract test support", () => {
  it("creates feature contexts with a fixed clock and default config", () => {
    const context = createFeatureContext();

    expect(context.clock.now()).toEqual(new Date("2026-06-26T09:00:00.000Z"));
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
      canHandle: (command) => command.capability === "test.echo",
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
      createCommand("test.echo", { message: "hello" }),
      { text: "hello" },
    );
    await expectFeatureRejects(
      feature,
      createCommand("test.echo", { message: "fail" }),
      "fixture failure",
    );
  });
});
