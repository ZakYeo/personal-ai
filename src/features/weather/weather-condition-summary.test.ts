import { qualitativeWeatherDetails } from "./weather-condition-summary.js";

describe("qualitativeWeatherDetails", () => {
  it.each([
    ["light rain", 0.4, "It is raining."],
    ["rain showers", 0.4, "There are showers."],
    ["snow", 0.4, "It is snowing."],
    ["thunderstorms", 0.4, "There are thunderstorms."],
  ])(
    "describes current %s in the present tense",
    (weather, precipitation, text) => {
      expect(
        qualitativeWeatherDetails(
          { precipitation, weather, windSpeed: 10 },
          "current",
        ),
      ).toEqual([text]);
    },
  );

  it.each([
    ["light rain", 0.4, "Expect rain."],
    ["rain showers", 0.4, "Expect showers."],
    ["snow", 0.4, "Expect snow."],
    ["thunderstorms", 0.4, "Expect thunderstorms."],
  ])(
    "describes forecast %s in the future tense",
    (weather, precipitation, text) => {
      expect(
        qualitativeWeatherDetails(
          { precipitation, weather, windSpeed: 10 },
          "forecast",
        ),
      ).toEqual([text]);
    },
  );

  it("uses temporal wording for notable wind", () => {
    expect(
      qualitativeWeatherDetails(
        { precipitation: 0, weather: "clear", windSpeed: 29 },
        "current",
      ),
    ).toEqual(["It is windy."]);
    expect(
      qualitativeWeatherDetails(
        { precipitation: 0, weather: "clear", windSpeed: 29 },
        "forecast",
      ),
    ).toEqual(["Expect windy conditions."]);
  });
});
