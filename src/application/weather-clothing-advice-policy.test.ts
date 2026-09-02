import {
  parseWeatherClothingAdvice,
  weatherClothingAdviceLimits,
} from "./weather-clothing-advice-policy.js";

describe("weather clothing advice policy", () => {
  it("accepts a matching bounded item assessment", () => {
    expect(
      parseWeatherClothingAdvice(
        { kind: "item_assessment", recommendation: "not_recommended" },
        "assess_item",
      ),
    ).toEqual({
      kind: "item_assessment",
      recommendation: "not_recommended",
    });
  });

  it("accepts one concise outfit with unique spoken-safe items", () => {
    const advice = {
      items: ["a T-shirt", "lightweight trousers"],
      kind: "outfit_recommendation",
    };

    expect(parseWeatherClothingAdvice(advice, "recommend_outfit")).toEqual(
      advice,
    );
    expect(
      Object.isFrozen(parseWeatherClothingAdvice(advice, "recommend_outfit")),
    ).toBe(true);
  });

  it.each([
    [{ kind: "outfit_recommendation", items: [] }, "between 1 and 4 items"],
    [
      {
        kind: "outfit_recommendation",
        items: Array.from(
          { length: weatherClothingAdviceLimits.outfitItems + 1 },
          (_, index) => `item ${index}`,
        ),
      },
      "between 1 and 4 items",
    ],
    [
      {
        kind: "outfit_recommendation",
        items: ["a scarf", "A SCARF"],
      },
      "unique items",
    ],
    [
      {
        kind: "outfit_recommendation",
        items: ["see https://example.test/coat"],
      },
      "spoken-safe items",
    ],
    [
      {
        kind: "outfit_recommendation",
        items: ["x".repeat(weatherClothingAdviceLimits.itemCharacters + 1)],
      },
      "1 to 80 characters",
    ],
    [
      { kind: "item_assessment", recommendation: "maybe" },
      "valid recommendation",
      "assess_item",
    ],
    [
      { kind: "item_assessment", recommendation: "recommended" },
      "match the requested goal",
      "recommend_outfit",
    ],
  ] as const)(
    "rejects invalid adviser output %#",
    (value, message, goal = "recommend_outfit") => {
      expect(() => parseWeatherClothingAdvice(value, goal)).toThrow(message);
    },
  );
});
