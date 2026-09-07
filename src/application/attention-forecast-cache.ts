import type { WeatherForecast, WeatherProviderPort } from "../ports/weather.js";

/** One bounded evaluation-window cache; never reuse a different shutdown scope. */
export function createAttentionForecastCache(
  provider: Pick<WeatherProviderPort, "getForecast">,
): Pick<WeatherProviderPort, "getForecast"> {
  let window: string | undefined;
  let signal: AbortSignal | undefined;
  const pending = new Map<string, Promise<WeatherForecast>>();
  return {
    getForecast: (request, options) => {
      if (window !== request.period.startAt || signal !== options.signal) {
        pending.clear();
        window = request.period.startAt;
        signal = options.signal;
      }
      const key = JSON.stringify(request);
      const cached = pending.get(key);
      if (cached) return cached;
      const result = provider.getForecast(request, options);
      if (pending.size >= 24) pending.delete(pending.keys().next().value!);
      pending.set(key, result);
      return result;
    },
  };
}
