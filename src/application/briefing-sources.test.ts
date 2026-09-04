import type { CalendarEvent, CalendarSearchPort } from "../ports/calendar.js";
import type {
  WeatherLocationCandidate,
  WeatherProviderPort,
} from "../ports/weather.js";
import {
  createCalendarBriefingSource,
  createInternetBriefingSource,
  createProfileBriefingSource,
  createWeatherBriefingSource,
} from "./briefing-sources.js";

describe("briefing sources", () => {
  it("uses stable opaque calendar keys when provider ordering changes", async () => {
    let events: CalendarEvent[] = [
      {
        id: "private-provider-id-one",
        startAt: "2026-09-04T08:00:00.000Z",
        startDate: "2026-09-04",
        startTime: "09:00",
        title: "Standup",
      },
      {
        id: "private-provider-id-two",
        startAt: "2026-09-04T10:00:00.000Z",
        startDate: "2026-09-04",
        startTime: "11:00",
        title: "Planning",
      },
    ];
    const calendar: CalendarSearchPort = {
      getEvent: () => Promise.resolve(undefined),
      searchEvents: () => Promise.resolve(events),
    };
    const source = createCalendarBriefingSource(calendar);
    const context = {
      now: new Date("2026-09-04T07:00:00.000Z"),
      timeZone: "Europe/London",
    };
    const first = await source.read(context);
    events = [events[1]!, events[0]!];
    const second = await source.read(context);
    const keyByText = (items: typeof first.items) =>
      Object.fromEntries(items.map(({ key, text }) => [text, key]));

    expect(keyByText(second.items)).toEqual(keyByText(first.items));
    expect(first.items.map(({ key }) => key).join(" ")).not.toContain(
      "private-provider-id",
    );
  });

  it("reads only narrow profile projections", async () => {
    const source = createProfileBriefingSource({
      personalContext: {
        readHomeLocation: () =>
          Promise.resolve({ place: "London", provenance: "user-authored" }),
      },
      personalization: {
        readAssistantPersonalization: () =>
          Promise.resolve({ preferredName: "Zak" }),
      },
    });

    await expect(
      source.read({
        now: new Date("2026-09-04T07:00:00.000Z"),
        timeZone: "Europe/London",
      }),
    ).resolves.toMatchObject({
      facts: {
        profileHomeLocation: "London",
        profilePreferredName: "Zak",
      },
      items: [{ text: "Good morning, Zak." }],
    });
  });

  it("requires an exact validated saved-home weather match", async () => {
    const context = {
      now: new Date("2026-09-04T07:00:00.000Z"),
      timeZone: "Europe/London",
    };
    const home = (place: string) => ({
      readHomeLocation: () =>
        Promise.resolve({ place, provenance: "user-authored" as const }),
    });

    await expect(
      createWeatherBriefingSource(weatherProvider([]), undefined).read(context),
    ).rejects.toThrow("saved home location");
    await expect(
      createWeatherBriefingSource(
        weatherProvider([weatherCandidate({ providerRank: 0 })]),
        home("London"),
      ).read(context),
    ).rejects.toThrow("malformed");
    await expect(
      createWeatherBriefingSource(
        weatherProvider([weatherCandidate()]),
        home("Lond"),
      ).read(context),
    ).rejects.toThrow("could not be resolved");
  });

  it("preserves the exact weather envelope and canonical notable threshold", async () => {
    const now = new Date("2026-09-04T07:00:00.000Z");
    const source = createWeatherBriefingSource(
      weatherProvider([weatherCandidate()], 29),
      {
        readHomeLocation: () =>
          Promise.resolve({ place: "London", provenance: "user-authored" }),
      },
    );

    const result = await source.read({ now, timeZone: "UTC" });

    expect(result.attention).toEqual(["weather:today"]);
    expect(result.items[0]).toMatchObject({
      citations: [{ title: "Open-Meteo", url: "https://open-meteo.com/" }],
      text: expect.stringContaining("It is windy.") as string,
    });
    expect(result.facts).toMatchObject({
      weatherAttributionName: "Open-Meteo",
      weatherFetchedAt: "2026-09-04T07:00:00.000Z",
      weatherLocation: "London",
      weatherObservedAt: "2026-09-04T06:55:00.000Z",
      weatherPeriodStartAt: "2026-09-04T07:00:00.000Z",
      weatherPrecipitationUnit: "mm",
      weatherTemperature: 18,
      weatherTemperatureUnit: "celsius",
      weatherTimeZone: "Europe/London",
      weatherWindSpeed: 29,
      weatherWindSpeedUnit: "km/h",
    });
  });

  it("retains only citations represented in the bounded internet projection", async () => {
    const firstMarker = "First update [1].";
    const answer = `${firstMarker}${"x".repeat(350)} Second update [2].`;
    const secondStart = answer.indexOf("[2]");
    const source = createInternetBriefingSource(
      {
        search: () =>
          Promise.resolve({
            answer,
            citations: [
              {
                endIndex: firstMarker.indexOf("[1]") + 3,
                sourceId: "first",
                startIndex: firstMarker.indexOf("[1]"),
              },
              {
                endIndex: secondStart + 3,
                sourceId: "second",
                startIndex: secondStart,
              },
            ],
            sources: [
              {
                id: "first",
                title: "First source",
                url: "https://example.com/first",
              },
              {
                id: "second",
                title: "Second source",
                url: "https://example.com/second",
              },
            ],
          }),
      },
      2,
    );

    const result = await source.read({
      now: new Date("2026-09-04T07:00:00.000Z"),
      timeZone: "Europe/London",
      topic: "updates",
    });

    expect(result.items[0]!.citations).toEqual([
      { title: "First source", url: "https://example.com/first" },
    ]);
    expect(result.items[0]!.text).not.toContain("Second update");
  });
});

function weatherCandidate(
  overrides: Partial<WeatherLocationCandidate> = {},
): WeatherLocationCandidate {
  return {
    countryName: "United Kingdom",
    location: {
      countryCode: "GB",
      latitude: 51.5,
      longitude: -0.12,
      name: "London",
      timezone: "Europe/London",
    },
    providerRank: 1,
    searchName: "London",
    ...overrides,
  };
}

function weatherProvider(
  candidates: WeatherLocationCandidate[],
  windSpeed = 10,
): WeatherProviderPort {
  return {
    findLocations: () => Promise.resolve(candidates),
    getForecast: (request) =>
      Promise.resolve({
        attribution: { name: "Open-Meteo", url: "https://open-meteo.com/" },
        current: {
          observedAt: "2026-09-04T06:55:00.000Z",
          precipitation: 0,
          temperature: 18,
          weather: "clear",
          windSpeed,
        },
        daily: [
          {
            date: "2026-09-04",
            precipitation: 0,
            temperatureMax: 21,
            temperatureMin: 12,
            weather: "clear",
            windSpeedMax: windSpeed,
          },
        ],
        fetchedAt: "2026-09-04T07:00:00.000Z",
        hourly: [],
        location: request.location,
        period: request.period,
        units: request.units,
      }),
  };
}
