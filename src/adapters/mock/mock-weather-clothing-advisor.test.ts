import { createMockWeatherClothingAdvisor } from "./mock-weather-clothing-advisor.js";

describe("mock weather clothing adviser", () => {
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

  it("returns deterministic item and outfit fixtures", async () => {
    const adviser = createMockWeatherClothingAdvisor();

    await expect(
      adviser.advise({
        conditions,
        goal: { item: "ceremonial sash", kind: "assess_item" },
        units,
      }),
    ).resolves.toEqual({
      kind: "item_assessment",
      recommendation: "uncertain",
    });
    await expect(
      adviser.advise({
        conditions,
        goal: { kind: "recommend_outfit", occasion: "a walk" },
        units,
      }),
    ).resolves.toEqual({
      items: ["a T-shirt", "lightweight trousers"],
      kind: "outfit_recommendation",
    });
  });
});
