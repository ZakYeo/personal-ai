import { createCapabilityRoutingIndex } from "../../application/capability-catalog.js";
import { createWeatherFeature } from "../../features/weather/weather-feature.js";
import { createWeatherWatchStoreFixture } from "../../test-support/weather-watch-store.js";
import { createWeatherProviderFixture } from "../../test-support/weather.js";
import { createWeatherClothingAdvisorFixture } from "../../test-support/weather-clothing-advisor.js";
import {
  createAssistantConfig,
  createCommand,
  createFixedClock,
} from "../../test-support/core-assistant.js";
import { createAssistant } from "./assistant.js";
import type { AssistantContext } from "../../ports/assistant.js";
import type { ConversationState } from "../../ports/conversation.js";

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
      clothingAdviser: createWeatherClothingAdvisorFixture(),
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
      text: expect.stringContaining(
        "Weather recommendation for a coat: uncertain",
      ) as string,
    });
    expect(readHomeLocation).toHaveBeenCalledOnce();
  });

  it("treats an open clothing follow-up as a fresh outfit recommendation", async () => {
    const provider = createWeatherProviderFixture();
    provider.findLocations = ({ place }) =>
      Promise.resolve([
        {
          countryName: "United Kingdom",
          location: {
            countryCode: "GB",
            latitude: 50.768,
            longitude: 0.29,
            name: place,
            timezone: "Europe/London",
          },
          providerRank: 1,
          searchName: place,
        },
      ]);
    const feature = createWeatherFeature(provider, {
      clothingAdviser: createWeatherClothingAdvisorFixture(),
      watchStore: createWeatherWatchStoreFixture(),
    });
    const histories: (ConversationState | undefined)[] = [];
    const starts = vi.fn(
      (
        text: string,
        intentContext: AssistantContext,
        history?: ConversationState,
      ) => {
        expect(intentContext.config.assistant.name).toBe("Jarvis");
        histories.push(history);
        return {
          next: () =>
            Promise.resolve(
              text === "What's the weather like right now?"
                ? {
                    command: createCommand(
                      "weather.current",
                      { location: "Eastbourne" },
                      text,
                    ),
                    kind: "command" as const,
                  }
                : text === "What would you recommend I wear?"
                  ? {
                      command: createCommand(
                        "weather.clothing",
                        { goal: "recommend_outfit" },
                        text,
                      ),
                      kind: "command" as const,
                    }
                  : {
                      command: createCommand(
                        "weather.clothing",
                        { goal: "assess_item", item: "hoodie" },
                        text,
                      ),
                      kind: "command" as const,
                    },
            ),
        };
      },
    );
    const assistant = createAssistant({
      capabilityRouting: createCapabilityRoutingIndex([feature]),
      clock: createFixedClock(new Date("2026-07-28T12:00:00.000Z")),
      config: createAssistantConfig({ weather: { enabled: true } }),
      conversation: {
        compactor: { compact: () => Promise.resolve("") },
        history: { maxTurnsBeforeCompaction: 5 },
        responder: {
          respond: () =>
            Promise.resolve({ status: "ok", text: "unused response" }),
        },
      },
      intentInterpreter: { start: starts },
    });

    await assistant.handleText("What's the weather like right now?");
    await assistant.handleText(
      "Do I need a coat today or should I wear a hoodie? What should I wear?",
    );
    const outfit = await assistant.handleText(
      "What would you recommend I wear?",
    );

    expect(outfit).toMatchObject({
      status: "ok",
      text: expect.stringContaining(
        "I recommend a T-shirt and lightweight trousers in Eastbourne right now",
      ) as string,
    });
    expect(outfit.text).not.toContain("What details should I use");
    expect(histories[2]).toMatchObject({
      recentTurns: [
        { content: "What's the weather like right now?", role: "user" },
        expect.objectContaining({ role: "assistant" }),
        {
          content:
            "Do I need a coat today or should I wear a hoodie? What should I wear?",
          role: "user",
        },
        expect.objectContaining({ role: "assistant" }),
      ],
    });
  });
});
