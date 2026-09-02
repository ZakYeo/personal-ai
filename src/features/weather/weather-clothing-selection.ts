import type {
  CurrentWeatherObservation,
  HourlyWeatherForecast,
  WeatherForecast,
  WeatherPeriod,
} from "../../ports/weather.js";

export interface SelectedClothingConditions {
  readonly at: string;
  readonly precipitation: number;
  readonly temperature: number;
  readonly weather: string;
  readonly windSpeed: number;
}

export function selectClothingConditions(
  forecast: WeatherForecast,
  mode: "current" | "period" | "point",
  requestedPeriod: WeatherPeriod,
): SelectedClothingConditions[] {
  if (mode === "current") {
    return [selectedCurrent(forecast.current)];
  }
  if (mode === "point") {
    const target = new Date(requestedPeriod.startAt).getTime();
    const nearest = [...forecast.hourly].sort((left, right) => {
      const distance =
        Math.abs(new Date(left.forecastAt).getTime() - target) -
        Math.abs(new Date(right.forecastAt).getTime() - target);
      return distance === 0
        ? left.forecastAt.localeCompare(right.forecastAt)
        : distance;
    })[0];
    return nearest &&
      Math.abs(new Date(nearest.forecastAt).getTime() - target) <= 60 * 60_000
      ? [selectedHourly(nearest)]
      : [];
  }

  const inside = forecast.hourly.filter(
    (item) =>
      item.forecastAt >= requestedPeriod.startAt &&
      item.forecastAt <= requestedPeriod.endAt,
  );
  if (inside.length > 0) return inside.map(selectedHourly);
  const midpoint =
    (new Date(requestedPeriod.startAt).getTime() +
      new Date(requestedPeriod.endAt).getTime()) /
    2;
  const nearest = [...forecast.hourly].sort(
    (left, right) =>
      Math.abs(new Date(left.forecastAt).getTime() - midpoint) -
        Math.abs(new Date(right.forecastAt).getTime() - midpoint) ||
      left.forecastAt.localeCompare(right.forecastAt),
  )[0];
  return nearest &&
    Math.abs(new Date(nearest.forecastAt).getTime() - midpoint) <= 60 * 60_000
    ? [selectedHourly(nearest)]
    : [];
}

function selectedCurrent(
  observation: CurrentWeatherObservation,
): SelectedClothingConditions {
  return { ...observation, at: observation.observedAt };
}

function selectedHourly(
  forecast: HourlyWeatherForecast,
): SelectedClothingConditions {
  return { ...forecast, at: forecast.forecastAt };
}
