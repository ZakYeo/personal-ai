import type { WeatherForecast, WeatherUnits } from "../../ports/weather.js";

export function currentWeatherResult(forecast: WeatherForecast) {
  const { current, location, units } = forecast;
  return {
    data: {
      attributionName: forecast.attribution.name,
      attributionUrl: forecast.attribution.url,
      fetchedAt: forecast.fetchedAt,
      latitude: location.latitude,
      location: location.name,
      longitude: location.longitude,
      observedAt: current.observedAt,
      periodEndAt: forecast.period.endAt,
      periodStartAt: forecast.period.startAt,
      precipitation: current.precipitation,
      precipitationUnit: units.precipitation,
      temperature: current.temperature,
      temperatureUnit: units.temperature,
      timezone: location.timezone,
      weather: current.weather,
      windSpeed: current.windSpeed,
      windSpeedUnit: units.windSpeed,
    },
    text: `In ${location.name}, it is ${current.temperature}${formatTemperatureUnit(units.temperature)} and ${current.weather}, with ${current.precipitation} ${units.precipitation} precipitation and wind at ${current.windSpeed} ${units.windSpeed}. Observed at ${current.observedAt}; fetched at ${forecast.fetchedAt}. ${formatAttribution(forecast)}`,
  };
}

export function forecastWeatherResult(forecast: WeatherForecast) {
  const hourly = forecast.hourly[0];
  const daily = forecast.daily[0];
  const summary = [
    hourly
      ? `At ${hourly.forecastAt}: ${hourly.temperature}${formatTemperatureUnit(forecast.units.temperature)}, ${hourly.weather}, ${hourly.precipitation} ${forecast.units.precipitation} precipitation, wind ${hourly.windSpeed} ${forecast.units.windSpeed}.`
      : undefined,
    daily
      ? `On ${daily.date}: ${daily.temperatureMin}–${daily.temperatureMax}${formatTemperatureUnit(forecast.units.temperature)}, ${daily.weather}, ${daily.precipitation} ${forecast.units.precipitation} precipitation, maximum wind ${daily.windSpeedMax} ${forecast.units.windSpeed}.`
      : undefined,
  ]
    .filter((value): value is string => value !== undefined)
    .join(" ");
  return {
    data: {
      attributionName: forecast.attribution.name,
      attributionUrl: forecast.attribution.url,
      ...flattenDaily(forecast),
      ...flattenHourly(forecast),
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
    text: `${forecast.location.name}'s forecast from ${forecast.period.startAt} to ${forecast.period.endAt}: ${summary || "No forecast intervals are available."} Fetched at ${forecast.fetchedAt}. ${formatAttribution(forecast)}`,
  };
}

function flattenHourly(forecast: WeatherForecast) {
  return forecast.hourly.reduce<Record<string, string | number>>(
    (facts, item, index) => ({
      ...facts,
      [`hourly${index}ForecastAt`]: item.forecastAt,
      [`hourly${index}Precipitation`]: item.precipitation,
      [`hourly${index}Temperature`]: item.temperature,
      [`hourly${index}Weather`]: item.weather,
      [`hourly${index}WindSpeed`]: item.windSpeed,
    }),
    { hourlyCount: forecast.hourly.length },
  );
}

function flattenDaily(forecast: WeatherForecast) {
  return forecast.daily.reduce<Record<string, string | number>>(
    (facts, item, index) => ({
      ...facts,
      [`daily${index}Date`]: item.date,
      [`daily${index}Precipitation`]: item.precipitation,
      [`daily${index}TemperatureMax`]: item.temperatureMax,
      [`daily${index}TemperatureMin`]: item.temperatureMin,
      [`daily${index}Weather`]: item.weather,
      [`daily${index}WindSpeedMax`]: item.windSpeedMax,
    }),
    { dailyCount: forecast.daily.length },
  );
}

function formatTemperatureUnit(unit: WeatherUnits["temperature"]): string {
  return unit === "celsius" ? "°C" : "°F";
}

function formatAttribution(forecast: WeatherForecast): string {
  return `Source: ${forecast.attribution.name} (${forecast.attribution.url}).`;
}
