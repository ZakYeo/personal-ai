import type { AssistantCommandParameters, AssistantCitation  } from "../../ports/assistant.js";
import type { WeatherForecast } from "../../ports/weather.js";

interface WeatherResultContent {
  readonly data?: AssistantCommandParameters;
  readonly text: string;
}

interface WeatherResultEnvelope {
  readonly citations: readonly AssistantCitation[];
  readonly data: AssistantCommandParameters;
  readonly spokenText: {
    readonly dateStyle: "contextual";
    readonly timeZone: string;
  };
  readonly text: string;
}

export function weatherResultEnvelope(
  forecast: WeatherForecast,
  content: WeatherResultContent,
): WeatherResultEnvelope {
  return {
    citations: [
      {
        title: forecast.attribution.name,
        url: forecast.attribution.url,
      },
    ],
    data: {
      ...content.data,
      attributionName: forecast.attribution.name,
      attributionUrl: forecast.attribution.url,
      currentObservedAt: forecast.current.observedAt,
      fetchedAt: forecast.fetchedAt,
      latitude: forecast.location.latitude,
      location: forecast.location.name,
      longitude: forecast.location.longitude,
      periodEndAt: forecast.period.endAt,
      periodStartAt: forecast.period.startAt,
      precipitationUnit: forecast.units.precipitation,
      temperatureUnit: forecast.units.temperature,
      timezone: forecast.location.timezone,
      windSpeedUnit: forecast.units.windSpeed,
    },
    spokenText: {
      dateStyle: "contextual",
      timeZone: forecast.location.timezone,
    },
    text: content.text,
  };
}

export function weatherAttributionText(forecast: WeatherForecast): string {
  return `Source: ${forecast.attribution.name}.`;
}
