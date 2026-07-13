import { deterministicScenarios } from "../test-support/deterministic-scenarios.js";
import { disabledCalendarConfig } from "../test-support/deterministic-runtime-fixtures.js";
import {
  createConfiguredTextRuntimeHarness,
  createRuntimeConfigWithGoogleCalendarAdapter,
  createRuntimeConfigWithOpenAIConversationProvider,
  createRuntimeConfigWithOpenAIIntentProvider,
  createRuntimeConfigWithOpenAIResponseRewriter,
  createRuntimeConfigWithUnknownConversationProvider,
  createRuntimeConfigWithMissingFeatureAdapter,
  createRuntimeConfigWithUnknownFeature,
  createRuntimeConfigWithUnknownFeatureAdapter,
  createRuntimeConfigWithUnknownIntentProvider,
  writeRuntimeHarnessConfig,
} from "../test-support/runtime-composition.js";

describe("createConfiguredTextRuntime", () => {
  it("wires enabled features into the assistant", async () => {
    const assistant = await createConfiguredTextRuntimeHarness();

    await expect(
      assistant.handleText(deterministicScenarios.calendarWedding.text),
    ).resolves.toEqual(deterministicScenarios.calendarWedding.response);
  });

  it("smoke-routes upcoming calendar events through the mock calendar adapter", async () => {
    const assistant = await createConfiguredTextRuntimeHarness();

    await expect(
      assistant.handleText(deterministicScenarios.calendarUpcomingEvents.text),
    ).resolves.toEqual(deterministicScenarios.calendarUpcomingEvents.response);
  });

  it("respects disabled features from config", async () => {
    const assistant = await createConfiguredTextRuntimeHarness({
      config: disabledCalendarConfig,
    });

    await expect(
      assistant.handleText(deterministicScenarios.unsupportedCalendar.text),
    ).resolves.toEqual(deterministicScenarios.unsupportedCalendar.response);
  });

  it("requires confirmation for high-risk alarm creation", async () => {
    const assistant = await createConfiguredTextRuntimeHarness();

    await expect(
      assistant.handleText(
        deterministicScenarios.alarmCreateNeedsConfirmation.text,
      ),
    ).resolves.toEqual(
      deterministicScenarios.alarmCreateNeedsConfirmation.response,
    );

    await expect(
      assistant.handleText(deterministicScenarios.alarmListEmpty.text),
    ).resolves.toEqual(deterministicScenarios.alarmListEmpty.response);
  });

  it("requires confirmation for alarm creation in the default config", async () => {
    const assistant = await createConfiguredTextRuntimeHarness({
      useRuntimeDefaultConfig: true,
    });

    await expect(
      assistant.handleText(
        deterministicScenarios.alarmCreateNeedsConfirmation.text,
      ),
    ).resolves.toEqual(
      deterministicScenarios.alarmCreateNeedsConfirmation.response,
    );

    await expect(
      assistant.handleText(deterministicScenarios.alarmListEmpty.text),
    ).resolves.toEqual(deterministicScenarios.alarmListEmpty.response);
  });

  it("answers capability list questions from the generated catalog", async () => {
    const assistant = await createConfiguredTextRuntimeHarness();

    await expect(
      assistant.handleText(deterministicScenarios.capabilityList.text),
    ).resolves.toEqual(deterministicScenarios.capabilityList.response);
  });

  it("rejects unknown intent providers at the config boundary", () => {
    expect(() => createRuntimeConfigWithUnknownIntentProvider()).toThrow(
      'Config intent.provider "unknown" is not registered.',
    );
  });

  it("rejects unknown conversation providers during composition", async () => {
    await expect(
      createConfiguredTextRuntimeHarness({
        config: createRuntimeConfigWithUnknownConversationProvider(),
      }),
    ).rejects.toThrow(
      'Config conversation.provider "unknown" is not registered.',
    );
  });

  it("wires OpenAI intent providers into the assistant", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            kind: "command",
            command: {
              capability: "alarm.list",
              parameters: [],
              rawText: deterministicScenarios.alarmListEmpty.text,
            },
            response: null,
          }),
        }),
        { status: 200 },
      ),
    );
    const assistant = await createConfiguredTextRuntimeHarness({
      config: createRuntimeConfigWithOpenAIIntentProvider(),
      env: { OPENAI_API_KEY: "test-api-key" },
      fetch,
    });

    await expect(
      assistant.handleText(deterministicScenarios.alarmListEmpty.text),
    ).resolves.toEqual(deterministicScenarios.alarmListEmpty.response);

    expect(fetch).toHaveBeenCalledWith(
      "https://api.openai.test/v1/responses",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("wires deterministic conversation providers into the assistant", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            command: null,
            kind: "conversation",
            response: null,
          }),
        }),
        { status: 200 },
      ),
    );
    const assistant = await createConfiguredTextRuntimeHarness({
      config: {
        ...createRuntimeConfigWithOpenAIIntentProvider(),
        conversation: {
          history: {
            maxTurnsBeforeCompaction: 5,
          },
          provider: "deterministic",
        },
      },
      env: { OPENAI_API_KEY: "test-api-key" },
      fetch,
    });

    await expect(
      assistant.handleText("Hey Jarvis, how are you today?"),
    ).resolves.toEqual({
      status: "ok",
      text: 'I can chat about "Hey Jarvis, how are you today?".',
    });
  });

  it("wires OpenAI conversation providers into the assistant", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            output_text: JSON.stringify({
              command: null,
              kind: "conversation",
              response: null,
            }),
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            output_text: JSON.stringify({
              expectsFollowUp: false,
              text: "I am doing well today.",
            }),
          }),
          { status: 200 },
        ),
      );
    const assistant = await createConfiguredTextRuntimeHarness({
      config: {
        ...createRuntimeConfigWithOpenAIIntentProvider(),
        conversation:
          createRuntimeConfigWithOpenAIConversationProvider().conversation,
      },
      env: { OPENAI_API_KEY: "test-api-key" },
      fetch,
    });

    await expect(
      assistant.handleText("Hey Jarvis, how are you today?"),
    ).resolves.toEqual({
      expectsFollowUp: false,
      status: "ok",
      text: "I am doing well today.",
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("wires OpenAI response rewriters into command responses", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            text: "The upcoming wedding is on 12th September 2026.",
          }),
        }),
        { status: 200 },
      ),
    );
    const assistant = await createConfiguredTextRuntimeHarness({
      config: createRuntimeConfigWithOpenAIResponseRewriter(),
      env: { OPENAI_API_KEY: "test-openai-key" },
      fetch,
    });

    await expect(
      assistant.handleText(deterministicScenarios.calendarWedding.text),
    ).resolves.toEqual({
      status: "ok",
      text: "The upcoming wedding is on 12th September 2026.",
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://api.openai.test/v1/responses",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("wires Google Calendar adapters into the assistant", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            {
              id: "wedding-2026",
              summary: "Upcoming wedding",
              start: { date: "2026-09-12" },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const assistant = await createConfiguredTextRuntimeHarness({
      config: createRuntimeConfigWithGoogleCalendarAdapter(),
      env: { GOOGLE_CALENDAR_ACCESS_TOKEN: "test-google-token" },
      fetch,
    });

    await expect(
      assistant.handleText(deterministicScenarios.calendarWedding.text),
    ).resolves.toEqual(deterministicScenarios.calendarWedding.response);

    expect(fetch).toHaveBeenCalledWith(
      "https://calendar.example.test/v3/calendars/primary/events?q=upcoming+wedding&singleEvents=true&orderBy=startTime&timeMin=2026-06-26T09%3A00%3A00.000Z&maxResults=10",
      expect.objectContaining({
        method: "GET",
      }),
    );
  });

  it("keeps injected clocks live across assistant calls", async () => {
    let now = new Date("2026-06-26T09:00:00.000Z");
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            {
              id: "wedding-2026",
              summary: "Upcoming wedding",
              start: { date: "2026-09-12" },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const assistant = await createConfiguredTextRuntimeHarness({
      config: createRuntimeConfigWithGoogleCalendarAdapter(),
      env: { GOOGLE_CALENDAR_ACCESS_TOKEN: "test-google-token" },
      fetch,
      now: () => now,
    });

    await assistant.handleText(deterministicScenarios.calendarWedding.text);
    now = new Date("2026-06-26T09:01:00.000Z");
    await assistant.handleText(deterministicScenarios.calendarWedding.text);

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("timeMin=2026-06-26T09%3A00%3A00.000Z"),
      expect.any(Object),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("timeMin=2026-06-26T09%3A01%3A00.000Z"),
      expect.any(Object),
    );
  });

  it("rejects enabled features without registered adapters", async () => {
    await expect(
      createConfiguredTextRuntimeHarness({
        configPath: await writeRuntimeHarnessConfig(
          createRuntimeConfigWithUnknownFeatureAdapter(),
        ),
      }),
    ).rejects.toThrow(
      'Config feature "calendar" adapter "unknown" is not registered.',
    );
  });

  it("rejects enabled features without registered feature adapters", async () => {
    await expect(
      createConfiguredTextRuntimeHarness({
        configPath: await writeRuntimeHarnessConfig(
          createRuntimeConfigWithUnknownFeature(),
        ),
      }),
    ).rejects.toThrow('Config feature "notes" is not registered.');
  });

  it("rejects enabled features without adapter IDs", async () => {
    await expect(
      createConfiguredTextRuntimeHarness({
        configPath: await writeRuntimeHarnessConfig(
          createRuntimeConfigWithMissingFeatureAdapter(),
        ),
      }),
    ).rejects.toThrow(
      'Config feature "calendar".adapter must be set for enabled features.',
    );
  });
});
