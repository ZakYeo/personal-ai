import type {
  FeatureExecutionContext,
  FeatureResult,
} from "../../ports/feature.js";
import type {
  WeatherLocation,
  WeatherProviderPort,
} from "../../ports/weather.js";
import { validateWeatherLocations } from "./weather-validation.js";

type WeatherLocationResolution =
  | { location: WeatherLocation }
  | { result: FeatureResult };

const maxLocationCharacters = 200;

export async function resolveWeatherLocation(
  provider: WeatherProviderPort,
  location: string | undefined,
  context: FeatureExecutionContext,
): Promise<WeatherLocationResolution> {
  const place = location?.trim();
  if (!place) {
    return {
      result: {
        expectsFollowUp: true,
        text: "Which location should I check?",
      },
    };
  }
  if (place.length > maxLocationCharacters) {
    throw new Error(
      `Weather locations must not exceed ${maxLocationCharacters} characters.`,
    );
  }

  const locations = await provider.findLocations(
    { place },
    context.signal ? { signal: context.signal } : {},
  );
  validateWeatherLocations(locations);
  if (locations.length === 0) {
    return {
      result: {
        expectsFollowUp: true,
        text: `I could not find a weather location for "${place}". Which location should I use?`,
      },
    };
  }
  if (locations.length > 1) {
    return {
      result: {
        expectsFollowUp: true,
        text: `I found multiple locations for ${place}: ${locations
          .map((candidate) => `${candidate.name} (${candidate.countryCode})`)
          .join(", ")}. Which one did you mean?`,
      },
    };
  }
  return { location: locations[0]! };
}
