import {
  assessWeatherClothing,
  weatherClothingCategories,
} from "./weather-clothing-policy.js";

describe("weather clothing policy", () => {
  it("keeps the provider-facing categories bounded", () => {
    expect(weatherClothingCategories).toEqual([
      "rain_protection",
      "insulating_outerwear",
      "warm_layer",
      "light_top",
      "short_legwear",
      "full_legwear",
      "cold_weather_accessory",
      "other",
    ]);
    expect(Object.isFrozen(weatherClothingCategories)).toBe(true);
  });

  it.each([
    ["rain_protection", rainy, "recommended"],
    ["rain_protection", mild, "not_recommended"],
    ["insulating_outerwear", cold, "recommended"],
    ["insulating_outerwear", windy, "recommended"],
    ["insulating_outerwear", mild, "not_recommended"],
    ["warm_layer", cool, "recommended"],
    ["warm_layer", warm, "not_recommended"],
    ["light_top", warm, "recommended"],
    ["light_top", rainy, "not_recommended"],
    ["short_legwear", hot, "recommended"],
    ["short_legwear", warm, "recommended"],
    ["full_legwear", warm, "not_recommended"],
    ["full_legwear", hot, "not_recommended"],
    ["cold_weather_accessory", veryCold, "recommended"],
    ["cold_weather_accessory", mild, "not_recommended"],
    ["other", mild, "limited"],
  ] as const)(
    "assesses %s conservatively as %s",
    (category, sample, recommendation) => {
      expect(assessWeatherClothing(category, [sample])).toMatchObject({
        recommendation,
      });
    },
  );

  it("uses the most conservative conditions across a period", () => {
    expect(assessWeatherClothing("short_legwear", [hot, rainy])).toMatchObject({
      decidingMeasurements: {
        maximumPrecipitation: 0.4,
        maximumWindSpeed: 14,
        minimumTemperature: 17,
        snowy: false,
        wet: true,
        windy: false,
      },
      recommendation: "not_recommended",
    });
    expect(
      assessWeatherClothing("insulating_outerwear", [hot, rainy]),
    ).toMatchObject({ recommendation: "recommended" });
  });

  it("treats weather terminology as precipitation evidence even at zero amount", () => {
    expect(
      assessWeatherClothing("rain_protection", [
        { ...mild, precipitation: 0, weather: "thunder showers" },
      ]),
    ).toMatchObject({ recommendation: "recommended" });
  });
});

const mild = {
  precipitation: 0,
  temperature: 19,
  weather: "partly cloudy",
  windSpeed: 12,
};
const rainy = {
  precipitation: 0.4,
  temperature: 17,
  weather: "light rain",
  windSpeed: 14,
};
const cold = { ...mild, temperature: 14 };
const veryCold = { ...mild, temperature: 8 };
const cool = { ...mild, temperature: 18 };
const warm = { ...mild, temperature: 20 };
const hot = { ...mild, temperature: 22 };
const windy = { ...mild, windSpeed: 29 };
