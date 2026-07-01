import type { IntentInterpreterPort } from "../ports/intent.js";
import { enabledDeterministicConfig } from "../test-support/deterministic-runtime-fixtures.js";
import { createConfiguredIntentInterpreter } from "./intent-provider-selection.js";

describe("createConfiguredIntentInterpreter", () => {
  it("constructs resolved intent providers through the provider registry", () => {
    const interpreter: IntentInterpreterPort = {
      interpret: vi.fn(),
    };
    const createDeterministic = vi.fn(() => interpreter);

    expect(
      createConfiguredIntentInterpreter(
        enabledDeterministicConfig,
        [],
        {
          env: {},
          fetch: vi.fn(),
        },
        {
          registry: {
            deterministic: createDeterministic,
          },
        },
      ),
    ).toBe(interpreter);

    expect(createDeterministic).toHaveBeenCalledWith({
      dependencies: {
        env: {},
        fetch: expect.any(Function) as typeof fetch,
      },
      features: [],
      intent: { provider: "deterministic" },
    });
  });
});
