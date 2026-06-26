import { describe, expect, it } from "vitest";
import { defineCapability, defineFeature } from "./feature.js";
import type { AssistantContext } from "./assistant.js";
import type { FeatureExecutionRequest, FeaturePlugin } from "./feature.js";

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

  it("dispatches only to the selected capability handler", async () => {
    const echo = vi.fn(
      (request: FeatureExecutionRequest<string, { message: string }>) => ({
        text: `echo:${request.args.message}`,
      }),
    );
    const count = vi.fn(
      (request: FeatureExecutionRequest<string, { value: number }>) => ({
        text: `count:${request.args.value}`,
      }),
    );
    const feature = defineFeature({
      id: "test",
      displayName: "Test",
      capabilities: {
        "test.echo": defineCapability({
          risk: "low",
          parameters: {
            message: { type: "string", required: true },
          },
          execute: echo,
        }),
        "test.count": defineCapability({
          risk: "low",
          parameters: {
            value: { type: "number", required: true },
          },
          execute: count,
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
    ).resolves.toEqual({
      text: "echo:hello",
    });
    expect(echo).toHaveBeenCalledTimes(1);
    expect(count).not.toHaveBeenCalled();

    await expect(
      feature.execute(
        {
          capability: "test.count",
          command: {
            capability: "test.count",
            parameters: {
              value: 3,
            },
            rawText: "count",
          },
          args: {
            value: 3,
          },
        },
        context,
      ),
    ).resolves.toEqual({
      text: "count:3",
    });
    expect(echo).toHaveBeenCalledTimes(1);
    expect(count).toHaveBeenCalledTimes(1);
  });

  it("rejects undeclared capabilities without calling declared handlers", async () => {
    const echo = vi.fn(() => ({
      text: "should not run",
    }));
    const feature = defineFeature({
      id: "test",
      displayName: "Test",
      capabilities: {
        "test.echo": defineCapability({
          risk: "low",
          parameters: {
            message: { type: "string", required: true },
          },
          execute: echo,
        }),
      },
    });

    await expect(
      (feature as FeaturePlugin).execute(
        {
          capability: "test.missing",
          command: {
            capability: "test.missing",
            parameters: {},
            rawText: "missing",
          },
          args: {},
        },
        context,
      ),
    ).rejects.toThrow("test cannot execute test.missing.");
    expect(echo).not.toHaveBeenCalled();
  });
});
