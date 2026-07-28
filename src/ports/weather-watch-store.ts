import type { WeatherLocation, WeatherPeriod } from "./weather.js";

export type WeatherWatchCondition =
  | {
      metric: "precipitation";
      operator: "atLeast";
      threshold: number;
      unit: "mm";
    }
  | {
      metric: "temperature";
      operator: "atLeast" | "atMost";
      threshold: number;
      unit: "celsius";
    }
  | {
      metric: "windSpeed";
      operator: "atLeast";
      threshold: number;
      unit: "km/h";
    };

export interface NewWeatherWatch {
  condition: WeatherWatchCondition;
  location: WeatherLocation;
  period: WeatherPeriod;
}

export type WeatherWatchStatus =
  | "active"
  | "cancelled"
  | "expired"
  | "triggered";

export interface WeatherWatchNotification {
  claimedAt: string;
  window: WeatherPeriod;
}

export interface WeatherWatchRecord extends NewWeatherWatch {
  createdAt: string;
  id: string;
  notification?: WeatherWatchNotification;
  revision: number;
  status: WeatherWatchStatus;
  terminalAt?: string;
  updatedAt: string;
}

export interface CancelWeatherWatchRequest {
  cancelledAt: string;
  expectedRevision: number;
  id: string;
}

export interface ClaimWeatherWatchNotificationRequest {
  claimedAt: string;
  expectedRevision: number;
  id: string;
  window: WeatherPeriod;
}

export interface ExpireWeatherWatchRequest {
  expectedRevision: number;
  expiredAt: string;
  id: string;
}

export interface WeatherWatchStore {
  add(watch: NewWeatherWatch): Promise<WeatherWatchRecord>;
  cancel(
    request: CancelWeatherWatchRequest,
  ): Promise<WeatherWatchRecord | undefined>;
  claimNotification(
    request: ClaimWeatherWatchNotificationRequest,
  ): Promise<WeatherWatchRecord | undefined>;
  expire(
    request: ExpireWeatherWatchRequest,
  ): Promise<WeatherWatchRecord | undefined>;
  list(): Promise<WeatherWatchRecord[]>;
}
