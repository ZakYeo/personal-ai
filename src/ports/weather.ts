type TemperatureUnit = "celsius" | "fahrenheit";
type PrecipitationUnit = "in" | "mm";
type WindSpeedUnit = "km/h" | "mph";

export interface WeatherUnits {
  precipitation: PrecipitationUnit;
  temperature: TemperatureUnit;
  windSpeed: WindSpeedUnit;
}

export interface WeatherLocation {
  countryCode: string;
  latitude: number;
  longitude: number;
  name: string;
  timezone: string;
}

export interface WeatherPeriod {
  endAt: string;
  startAt: string;
}

export interface WeatherAttribution {
  name: string;
  url: string;
}

export interface CurrentWeatherObservation {
  observedAt: string;
  precipitation: number;
  temperature: number;
  weather: string;
  windSpeed: number;
}

export interface HourlyWeatherForecast {
  forecastAt: string;
  precipitation: number;
  temperature: number;
  weather: string;
  windSpeed: number;
}

export interface DailyWeatherForecast {
  date: string;
  precipitation: number;
  temperatureMax: number;
  temperatureMin: number;
  weather: string;
  windSpeedMax: number;
}

export interface WeatherForecast {
  attribution: WeatherAttribution;
  current: CurrentWeatherObservation;
  daily: DailyWeatherForecast[];
  fetchedAt: string;
  generatedAt: string;
  hourly: HourlyWeatherForecast[];
  location: WeatherLocation;
  period: WeatherPeriod;
  units: WeatherUnits;
}

export interface WeatherLocationQuery {
  place: string;
}

export interface WeatherForecastRequest {
  location: WeatherLocation;
  period: WeatherPeriod;
  units: WeatherUnits;
}

export interface WeatherRequestOptions {
  signal?: AbortSignal;
}

export interface WeatherProviderPort {
  findLocations(
    query: WeatherLocationQuery,
    options: WeatherRequestOptions,
  ): Promise<WeatherLocation[]>;
  getForecast(
    request: WeatherForecastRequest,
    options: WeatherRequestOptions,
  ): Promise<WeatherForecast>;
}
