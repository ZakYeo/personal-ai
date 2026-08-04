import { parseWeatherWatchState } from "./weather-watch-state-schema.js";

describe("weather watch state schema", () => {
  it("rejects an oversized collection before parsing individual watches", () => {
    expect(() =>
      parseWeatherWatchState({
        version: 1,
        watches: Array(1_001).fill(null),
      }),
    ).toThrow("Weather watch state cannot contain more than 1000 watches.");
  });
});
