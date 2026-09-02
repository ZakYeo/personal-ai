import { jsonResponse } from "../../test-support/adapter-contract.js";
import {
  resolveWeatherClothingAdvisorProvider,
  type WeatherClothingAdvisorProviderDependencies,
} from "./weather-clothing-advisor-provider.js";

const conditions = [
  {
    at: "2026-09-02T14:00:00.000Z",
    precipitation: 0,
    temperature: 20,
    weather: "overcast",
    windSpeed: 10,
  },
];
const units = {
  precipitation: "mm" as const,
  temperature: "celsius" as const,
  windSpeed: "km/h" as const,
};

describe("weather clothing adviser provider", () => {
  it("resolves the mock as a configless provider", async () => {
    const provider = resolveWeatherClothingAdvisorProvider({
      openai: "ignored because mock is configless",
      provider: "mock",
    });
    const resolved = provider.create(createDependencies());

    expect(() => resolved.validateStartup()).not.toThrow();
    await expect(
      resolved.adviser.advise({
        conditions,
        goal: { kind: "recommend_outfit" },
        units,
      }),
    ).resolves.toMatchObject({ kind: "outfit_recommendation" });
  });

  it("captures parsed OpenAI config for construction and preflight", async () => {
    const fetch = vi.fn(() =>
      Promise.resolve(
        jsonResponse({
          output_text: JSON.stringify({
            kind: "item_assessment",
            recommendation: "recommended",
          }),
        }),
      ),
    );
    const provider = resolveWeatherClothingAdvisorProvider({
      openai: { apiKeyEnv: "CLOTHING_KEY", model: "gpt-test" },
      provider: "openai",
    });
    const resolved = provider.create(
      createDependencies({ CLOTHING_KEY: "secret" }, fetch),
    );

    expect(() => resolved.validateStartup()).not.toThrow();
    await expect(
      resolved.adviser.advise({
        conditions,
        goal: { item: "shorts", kind: "assess_item" },
        units,
      }),
    ).resolves.toMatchObject({
      kind: "item_assessment",
      recommendation: "recommended",
    });
  });
});

function createDependencies(
  env: Record<string, string | undefined> = {},
  fetch: typeof globalThis.fetch = vi.fn(),
): WeatherClothingAdvisorProviderDependencies {
  return { env, fetch };
}
