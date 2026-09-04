// cspell:ignore Londn

import type { WeatherLocationCandidate } from "../../ports/weather.js";
import { selectWeatherLocation } from "../../application/weather-location-selection.js";

const candidates = [
  candidate({
    countryCode: "GB",
    countryName: "United Kingdom",
    featureCode: "PPLC",
    name: "London, England",
    population: 8_961_989,
    providerRank: 1,
    searchName: "London",
    timezone: "Europe/London",
  }),
  candidate({
    countryCode: "CA",
    countryName: "Canada",
    featureCode: "PPLA2",
    name: "London, Ontario",
    population: 422_324,
    providerRank: 2,
    searchName: "London",
    timezone: "America/Toronto",
  }),
] as const;

describe("selectWeatherLocation", () => {
  it("uses provider ranking deterministically for low-risk reads", () => {
    expect(selectWeatherLocation("London", candidates, "ranked")).toEqual({
      kind: "selected",
      location: candidates[0].location,
    });
  });

  it.each(["London, United Kingdom", "London UK", "London, GB"])(
    "honours an explicit country qualifier: %s",
    (place) => {
      expect(selectWeatherLocation(place, candidates, "unique")).toEqual({
        kind: "selected",
        location: candidates[0].location,
      });
    },
  );

  it("keeps ambiguous persistent-action locations unresolved", () => {
    expect(selectWeatherLocation("London", candidates, "unique")).toEqual({
      candidates,
      kind: "ambiguous",
    });
  });

  it.each(["London, Canada", "Londn"])(
    "does not fall back to a contradictory or fuzzy candidate: %s",
    (place) => {
      expect(selectWeatherLocation(place, [candidates[0]], "ranked")).toEqual({
        kind: "not_found",
      });
    },
  );
});

function candidate(input: {
  countryCode: string;
  countryName: string;
  featureCode: string;
  name: string;
  population: number;
  providerRank: number;
  searchName: string;
  timezone: string;
}): WeatherLocationCandidate {
  return {
    countryName: input.countryName,
    featureCode: input.featureCode,
    location: {
      countryCode: input.countryCode,
      latitude: input.providerRank,
      longitude: input.providerRank,
      name: input.name,
      timezone: input.timezone,
    },
    population: input.population,
    providerRank: input.providerRank,
    searchName: input.searchName,
  };
}
