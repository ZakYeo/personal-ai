import { summarizeWeatherClothingConditions } from "./weather-clothing-condition-summary.js";

describe("weather clothing condition summary", () => {
  it("summarizes a bounded period without making the clothing decision", () => {
    expect(
      summarizeWeatherClothingConditions([
        {
          at: "2026-09-02T09:00:00.000Z",
          precipitation: 0,
          temperature: 20,
          weather: "overcast",
          windSpeed: 12,
        },
        {
          at: "2026-09-02T10:00:00.000Z",
          precipitation: 0.4,
          temperature: 17,
          weather: "light rain",
          windSpeed: 30,
        },
      ]),
    ).toEqual({
      description: "mild, wet and windy conditions",
      maximumPrecipitation: 0.4,
      maximumTemperature: 20,
      maximumWindSpeed: 30,
      minimumTemperature: 17,
      snowy: false,
      temperatureBand: "mild",
      wet: true,
      windy: true,
    });
  });

  it("rejects an empty condition set", () => {
    expect(() => summarizeWeatherClothingConditions([])).toThrow(
      "requires conditions",
    );
  });
});
