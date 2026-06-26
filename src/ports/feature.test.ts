import { describe, expect, it } from "vitest";
import { defineCapability, defineFeature } from "./feature.js";
import type { AssistantContext } from "./assistant.js";

const context: AssistantContext = {
  clock: {
    now: () => new Date("2026-06-26T09:00:00.000Z"),
  },
  config: {
    assistant: {
      name: "Jarvis",
      wakePhrases: ["hey jarvis"],
    },
    intent: {
      provider: "deterministic",
    },
    features: {
      test: {
        enabled: true,
      },
    },
  },
};

describe("defineFeature", () => {
  it("derives handler argument types from capability parameters", async () => {
    const feature = defineFeature({
      id: "test",
      displayName: "Test",
      capabilities: {
        "test.echo": defineCapability({
          risk: "low",
          parameters: {
            loud: { type: "boolean" },
            message: { type: "string", required: true },
            repeat: { type: "number", minimum: 1 },
          } as const,
          execute: (request) => {
            const message: string = request.args.message;
            const repeat: number | undefined = request.args.repeat;
            const loud: boolean | undefined = request.args.loud;

            // @ts-expect-error message is derived as a string, not a number.
            const invalidMessage: number = request.args.message;
            // @ts-expect-error repeat is optional because the parameter is not required.
            const invalidRepeat: number = request.args.repeat;

            return {
              text: `${loud ? message.toUpperCase() : message}:${repeat ?? 1}:${invalidMessage}:${invalidRepeat}`,
            };
          },
        }),
      },
    });

    await expect(
      feature.execute(
        {
          capability: "test.echo",
          command: {
            capability: "test.echo",
            parameters: {
              message: "hello",
            },
            rawText: "hello",
          },
          args: {
            message: "hello",
          },
        },
        context,
      ),
    ).resolves.toMatchObject({
      text: "hello:1:hello:undefined",
    });
    expect(feature.capabilities).toEqual([
      {
        name: "test.echo",
        risk: "low",
        parameters: {
          loud: { type: "boolean" },
          message: { type: "string", required: true },
          repeat: { type: "number", minimum: 1 },
        },
      },
    ]);
  });
});
