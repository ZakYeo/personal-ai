import type { FeatureResult } from "../../ports/feature.js";
import type { WeatherLocation } from "../../ports/weather.js";

export function withWeatherLocationReference(
  result: FeatureResult,
  location: WeatherLocation,
): FeatureResult {
  if (result.kind === "resumable_clarification") return result;
  return {
    ...result,
    resultReferences: {
      items: [
        {
          facts: {
            countryCode: location.countryCode,
            name: location.name,
            timezone: location.timezone,
          },
          target: {
            kind: "weather_location",
            location: { ...location },
          },
        },
      ],
      kind: "weather_locations",
    },
  };
}
