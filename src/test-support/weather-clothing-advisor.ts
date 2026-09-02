import type {
  WeatherClothingAdvice,
  WeatherClothingAdvisorPort,
} from "../ports/weather-clothing-advisor.js";

export function createWeatherClothingAdvisorFixture(
  itemAdvice: Extract<WeatherClothingAdvice, { kind: "item_assessment" }> = {
    kind: "item_assessment",
    recommendation: "uncertain",
  },
): WeatherClothingAdvisorPort {
  return {
    advise: (request) =>
      Promise.resolve(
        request.goal.kind === "recommend_outfit"
          ? {
              items: ["a T-shirt", "lightweight trousers"],
              kind: "outfit_recommendation",
            }
          : itemAdvice,
      ),
  };
}
