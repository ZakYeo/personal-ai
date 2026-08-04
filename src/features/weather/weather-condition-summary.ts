export type WeatherTemporalMode = "current" | "forecast";

interface WeatherConditions {
  precipitation: number;
  weather: string;
  windSpeed: number;
}

const WINDY_THRESHOLD_KMH = 29;

export function qualitativeWeatherDetails(
  conditions: WeatherConditions,
  mode: WeatherTemporalMode,
): string[] {
  return [
    qualitativePrecipitation(conditions, mode),
    conditions.windSpeed >= WINDY_THRESHOLD_KMH
      ? mode === "current"
        ? "It is windy."
        : "Expect windy conditions."
      : undefined,
  ].filter((detail): detail is string => detail !== undefined);
}

function qualitativePrecipitation(
  conditions: Pick<WeatherConditions, "precipitation" | "weather">,
  mode: WeatherTemporalMode,
): string | undefined {
  if (/\bthunder/iu.test(conditions.weather)) {
    return mode === "current"
      ? "There are thunderstorms."
      : "Expect thunderstorms.";
  }
  if (/\bsnow\b/iu.test(conditions.weather)) {
    return mode === "current" ? "It is snowing." : "Expect snow.";
  }
  if (/\bsleet\b/iu.test(conditions.weather)) {
    return mode === "current" ? "There is sleet." : "Expect sleet.";
  }
  if (/\bshowers?\b/iu.test(conditions.weather)) {
    return mode === "current" ? "There are showers." : "Expect showers.";
  }
  if (conditions.precipitation > 0 || /\brain\b/iu.test(conditions.weather)) {
    return mode === "current" ? "It is raining." : "Expect rain.";
  }
}
