import type {
  FeatureExecutionContext,
  FeatureResult,
} from "../../ports/feature.js";
import type { PersonalContextReaderPort } from "../../ports/personal-context.js";
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
  personalContext?: PersonalContextReaderPort,
): Promise<WeatherLocationResolution> {
  const requestedPlace = location?.trim();
  const requestsHome =
    requestedPlace === undefined || requestedPlace.toLowerCase() === "home";
  const explicitHome = requestsHome
    ? await personalContext?.readHomeLocation()
    : undefined;
  const place =
    explicitHome?.provenance === "user-authored"
      ? explicitHome.place.trim()
      : requestsHome
        ? undefined
        : requestedPlace;
  if (!place) {
    return {
      result: {
        expectsFollowUp: true,
        text:
          requestedPlace?.toLowerCase() === "home" || personalContext
            ? "I do not have an explicitly stored home location. Which location should I check?"
            : "Which location should I check?",
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
