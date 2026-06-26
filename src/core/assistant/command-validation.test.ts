import {
  decodeCommandForCapability,
  validateCommandForCapability,
} from "./command-validation.js";
import type { AssistantCommand } from "../../ports/assistant.js";
import type { FeatureCapability } from "../../ports/feature.js";
import { createCommand as createAssistantCommand } from "../../test-support/core-assistant.js";

const capability: FeatureCapability = {
  name: "alarm.create",
  risk: "high",
  parameters: {
    label: { type: "string" },
    minutesFromNow: { type: "number", required: true, positive: true },
  },
};

describe("validateCommandForCapability", () => {
  it("accepts a command matching capability parameter metadata", () => {
    expect(
      validateCommandForCapability(
        createCommand({ label: "ping me", minutesFromNow: 10 }),
        capability,
      ),
    ).toBeUndefined();
  });

  it("decodes validated command parameters into feature arguments", () => {
    expect(
      decodeCommandForCapability(
        createCommand({ label: "ping me", minutesFromNow: 10 }),
        capability,
      ),
    ).toEqual({
      ok: true,
      args: {
        label: "ping me",
        minutesFromNow: 10,
      },
    });
  });

  it("omits absent optional parameters from decoded feature arguments", () => {
    expect(
      decodeCommandForCapability(
        createCommand({ minutesFromNow: 10 }),
        capability,
      ),
    ).toEqual({
      ok: true,
      args: {
        minutesFromNow: 10,
      },
    });
  });

  it("rejects missing required parameters", () => {
    expect(
      validateCommandForCapability(
        createCommand({ label: "ping me" }),
        capability,
      ),
    ).toMatchObject({
      category: "validation",
      message: "alarm.create requires minutesFromNow.",
    });
  });

  it("rejects parameter type mismatches", () => {
    expect(
      validateCommandForCapability(
        createCommand({ minutesFromNow: "ten" }),
        capability,
      ),
    ).toMatchObject({
      category: "validation",
      message: "alarm.create parameter minutesFromNow must be a number.",
    });
  });

  it("rejects non-positive numeric parameters", () => {
    expect(
      validateCommandForCapability(
        createCommand({ minutesFromNow: 0 }),
        capability,
      ),
    ).toMatchObject({
      category: "validation",
      message: "alarm.create parameter minutesFromNow must be positive.",
    });
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects non-finite numeric parameters: %s",
    (minutesFromNow) => {
      expect(
        validateCommandForCapability(
          createCommand({ minutesFromNow }),
          capability,
        ),
      ).toMatchObject({
        category: "validation",
        message: "alarm.create parameter minutesFromNow must be finite.",
      });
    },
  );

  it("rejects unsupported parameters", () => {
    expect(
      validateCommandForCapability(
        createCommand({ minutesFromNow: 10, unexpected: true }),
        capability,
      ),
    ).toMatchObject({
      category: "validation",
      message: "alarm.create does not support unexpected.",
    });
  });
});

function createCommand(
  parameters: AssistantCommand["parameters"],
): AssistantCommand {
  return createAssistantCommand("alarm.create", parameters, "set an alarm");
}
