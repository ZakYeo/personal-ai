import { createCapabilityRoutingIndex } from "../../application/capability-catalog.js";
import { createWeatherFeature } from "../../features/weather/weather-feature.js";
import { createWeatherWatchStoreFixture } from "../../test-support/weather-watch-store.js";
import { createWeatherProviderFixture } from "../../test-support/weather.js";
import {
  createAssistantConfig,
  createCommand,
  createFixedClock,
} from "../../test-support/core-assistant.js";
import { createAssistant } from "./assistant.js";

describe("assistant weather dialogue", () => {
  it("reuses Eastbourne from a completed home-weather turn for immediate coat advice", async () => {
    const provider = createWeatherProviderFixture();
    provider.findLocations = ({ place }) =>
      Promise.resolve(
        place.toLocaleLowerCase() === "eastbourne"
          ? [
              {
                countryName: "United Kingdom",
                location: {
                  countryCode: "GB",
                  latitude: 50.768,
                  longitude: 0.29,
                  name: "Eastbourne",
                  timezone: "Europe/London",
                },
                providerRank: 1,
                searchName: "Eastbourne",
              },
            ]
          : [],
      );
    const readHomeLocation = vi.fn(() =>
      Promise.resolve({
        place: "Eastbourne",
        provenance: "user-authored" as const,
      }),
    );
    const feature = createWeatherFeature(provider, {
      personalContext: { readHomeLocation },
      watchStore: createWeatherWatchStoreFixture(),
    });
    const assistant = createAssistant({
      capabilityRouting: createCapabilityRoutingIndex([feature]),
      clock: createFixedClock(new Date("2026-07-28T12:00:00.000Z")),
      config: createAssistantConfig({ weather: { enabled: true } }),
      intentInterpreter: {
        start: (text) => ({
          next: () =>
            Promise.resolve(
              text === "Check the weather for my home please"
                ? {
                    command: createCommand(
                      "weather.current",
                      { location: "home" },
                      text,
                    ),
                    kind: "command" as const,
                  }
                : {
                    command: createCommand("weather.coat", {}, text),
                    kind: "command" as const,
                  },
            ),
        }),
      },
    });

    await expect(
      assistant.handleText("Check the weather for my home please"),
    ).resolves.toMatchObject({
      status: "ok",
      text: expect.stringContaining("In Eastbourne") as string,
    });
    await expect(
      assistant.handleText("Could I wear a coat if I left now?"),
    ).resolves.toMatchObject({
      status: "ok",
      text: expect.stringContaining("a coat in Eastbourne right now") as string,
    });
    expect(readHomeLocation).toHaveBeenCalledOnce();
  });
});
