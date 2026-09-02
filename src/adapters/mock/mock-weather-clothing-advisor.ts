import type { WeatherClothingAdvisorPort } from "../../ports/weather-clothing-advisor.js";

export function createMockWeatherClothingAdvisor(): WeatherClothingAdvisorPort {
  return {
    advise: (request) =>
      Promise.resolve(
        request.goal.kind === "assess_item"
          ? {
              kind: "item_assessment",
              recommendation: "uncertain",
            }
          : {
              items: ["a T-shirt", "lightweight trousers"],
              kind: "outfit_recommendation",
            },
      ),
  };
}
