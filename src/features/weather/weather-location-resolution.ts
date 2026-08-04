import type {
  FeatureExecutionContext,
  FeatureResult,
} from "../../ports/feature.js";
import type { PersonalContextReaderPort } from "../../ports/personal-context.js";
import type {
  WeatherLocation,
  WeatherProviderPort,
} from "../../ports/weather.js";
import { validateWeatherLocationCandidates } from "../../ports/weather-policy.js";
import { selectWeatherLocation } from "./weather-location-selection.js";

type WeatherLocationResolution =
  | { location: WeatherLocation }
  | { result: FeatureResult };

const maxLocationCharacters = 200;

export async function resolveWeatherLocation(
  provider: WeatherProviderPort,
  location: string | undefined,
  context: FeatureExecutionContext,
  options: {
    personalContext?: PersonalContextReaderPort;
    selection: "ranked" | "unique";
  },
): Promise<WeatherLocationResolution> {
  const requestedPlace = location?.trim();
  const requestsHome =
    requestedPlace === undefined || requestedPlace.toLowerCase() === "home";
  const explicitHome = requestsHome
    ? await options.personalContext?.readHomeLocation()
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
        clarification: { kind: "resumable" },
        expectsFollowUp: true,
        text:
          requestedPlace?.toLowerCase() === "home" || options.personalContext
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

  const candidates = await provider.findLocations(
    { place },
    context.signal ? { signal: context.signal } : {},
  );
  validateWeatherLocationCandidates(candidates);
  if (candidates.length === 0) {
    return {
      result: unavailableLocationResult(place),
    };
  }
  const selection = selectWeatherLocation(place, candidates, options.selection);
  if (selection.kind === "not_found") {
    return {
      result: unavailableLocationResult(place),
    };
  }
  if (selection.kind === "ambiguous") {
    return {
      result: {
        clarification: { kind: "resumable" },
        expectsFollowUp: true,
        text: `I found multiple locations for ${place}: ${selection.candidates
          .map(
            (candidate) =>
              `${candidate.location.name} (${candidate.location.countryCode})`,
          )
          .join(", ")}. Which one did you mean?`,
      },
    };
  }
  return { location: selection.location };
}

function unavailableLocationResult(place: string): FeatureResult {
  return {
    clarification: { kind: "resumable" },
    expectsFollowUp: true,
    text: `I could not find a weather location for "${place}". Which location should I use?`,
  };
}
