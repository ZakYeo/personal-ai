import type { AlarmStore } from "../ports/alarm-store.js";
import type {
  BriefingSourcePort,
  BriefingSourceResult,
} from "../ports/briefing.js";
import type { CalendarSearchPort } from "../ports/calendar.js";
import type {
  InternetSearchPort,
  InternetSearchResponse,
} from "../ports/internet-search.js";
import type {
  AssistantPersonalizationReaderPort,
  PersonalContextReaderPort,
} from "../ports/personal-context.js";
import type { TaskStore } from "../ports/task-store.js";
import type { WeatherProviderPort } from "../ports/weather.js";
import type { AssistantCommandParameters } from "../ports/assistant.js";
import { zonedParts } from "./local-date-time.js";
import { sanitizeHumanTextMarkup } from "./human-text.js";
import { validateInternetSearchResponse } from "./internet-search-policy.js";
import { qualitativeWeatherDetails } from "./weather-condition-summary.js";
import { selectWeatherLocation } from "./weather-location-selection.js";
import {
  formatWeatherObservationAge,
  metricWeatherUnits,
  validateWeatherForecast,
  validateWeatherLocationCandidates,
} from "./weather-policy.js";

export function createProfileBriefingSource(readers: {
  readonly personalContext?: PersonalContextReaderPort;
  readonly personalization?: AssistantPersonalizationReaderPort;
}): BriefingSourcePort {
  return {
    section: "profile",
    read: async () => {
      const [personalization, home] = await Promise.all([
        readers.personalization?.readAssistantPersonalization(),
        readers.personalContext?.readHomeLocation(),
      ]);
      const preferredName = personalization?.preferredName;
      const homeLocation = home?.place;
      const text = preferredName
        ? `Good morning, ${preferredName}.`
        : homeLocation
          ? `Your saved home is ${homeLocation}.`
          : "Your personal briefing context is available.";
      return {
        attention: [],
        facts: {
          ...(homeLocation ? { profileHomeLocation: homeLocation } : {}),
          ...(preferredName ? { profilePreferredName: preferredName } : {}),
        },
        items: [{ key: "profile:context", text }],
        section: "profile",
      };
    },
  };
}

export function createCalendarBriefingSource(
  calendar: CalendarSearchPort,
): BriefingSourcePort {
  return {
    section: "calendar",
    read: async ({ now, timeZone }) => {
      const date = localDate(now, timeZone);
      const events = (
        await calendar.searchEvents({ endDate: date, startDate: date }, { now })
      ).slice(0, 10);
      const facts = Object.fromEntries(
        events.flatMap((event, index) => [
          [`calendar${index}Date`, event.startDate],
          [`calendar${index}Title`, event.title],
          ...(event.startAt
            ? [[`calendar${index}StartAt`, event.startAt] as const]
            : []),
        ]),
      );
      const attention = events
        .map((event) => ({ event, key: stableKey("calendar", event.id) }))
        .filter(
          ({ event }) =>
            event.startAt &&
            new Date(event.startAt).getTime() - now.getTime() <=
              2 * 60 * 60_000,
        )
        .map(({ key }) => key);
      return {
        attention,
        facts: { calendarCount: events.length, ...facts },
        items:
          events.length === 0
            ? [{ key: "calendar:none", text: "Your calendar is clear today." }]
            : events.map((event) => ({
                key: stableKey("calendar", event.id),
                text: `${event.title} is ${event.startAt ? `at ${event.startAt}` : "all day"}.`,
              })),
        section: "calendar",
      };
    },
  };
}

export function createAlarmBriefingSource(
  store: Pick<AlarmStore, "list">,
): BriefingSourcePort {
  return {
    section: "alarms",
    read: async ({ now, timeZone }) => {
      const today = localDate(now, timeZone);
      const alarms = (await store.list())
        .filter(
          (alarm) =>
            ["scheduled", "snoozed", "ringing"].includes(alarm.status) &&
            localDate(new Date(alarm.scheduledFor), timeZone) === today,
        )
        .slice(0, 10);
      const attention = alarms
        .map((alarm) => ({ alarm, key: stableKey("alarms", alarm.id) }))
        .filter(
          ({ alarm }) =>
            new Date(alarm.scheduledFor).getTime() - now.getTime() <=
            2 * 60 * 60_000,
        )
        .map(({ key }) => key);
      return {
        attention,
        facts: alarms.reduce<AssistantCommandParameters>(
          (facts, alarm, index) => ({
            ...facts,
            [`alarm${index}Label`]: alarm.label,
            [`alarm${index}ScheduledFor`]: alarm.scheduledFor,
          }),
          { alarmCount: alarms.length },
        ),
        items:
          alarms.length === 0
            ? [
                {
                  key: "alarm:none",
                  text: "You have no alarms scheduled today.",
                },
              ]
            : alarms.map((alarm) => ({
                key: stableKey("alarms", alarm.id),
                text: `${alarm.label} is set for ${alarm.scheduledFor}.`,
              })),
        section: "alarms",
      };
    },
  };
}

export function createTaskBriefingSource(
  store: Pick<TaskStore, "listLists" | "listTasks">,
): BriefingSourcePort {
  return {
    section: "tasks",
    read: async ({ now, timeZone }) => {
      const today = localDate(now, timeZone);
      const lists = new Map(
        (await store.listLists()).map((list) => [list.id, list.name]),
      );
      const tasks = (await store.listTasks())
        .filter(
          (task) =>
            task.status === "open" && task.dueDate && task.dueDate <= today,
        )
        .slice(0, 10);
      return {
        attention: tasks.map((task) => stableKey("tasks", task.id)),
        facts: tasks.reduce<AssistantCommandParameters>(
          (facts, task, index) => ({
            ...facts,
            [`task${index}DueDate`]: task.dueDate,
            [`task${index}Label`]: task.label,
          }),
          { taskCount: tasks.length },
        ),
        items:
          tasks.length === 0
            ? [{ key: "task:none", text: "You have no tasks due today." }]
            : tasks.map((task) => ({
                key: stableKey("tasks", task.id),
                text: `${task.label} on ${lists.get(task.listId) ?? "your task list"} is ${task.dueDate! < today ? "overdue" : "due today"}.`,
              })),
        section: "tasks",
      };
    },
  };
}

export function createWeatherBriefingSource(
  provider: WeatherProviderPort,
  personalContext: PersonalContextReaderPort | undefined,
): BriefingSourcePort {
  return {
    section: "weather",
    read: async ({ now, signal }) => {
      const home = await personalContext?.readHomeLocation();
      if (!home)
        throw new Error(
          "A saved home location is required for the briefing weather section.",
        );
      const candidates = await provider.findLocations(
        { place: home.place },
        signal ? { signal } : {},
      );
      validateWeatherLocationCandidates(candidates);
      const selection = selectWeatherLocation(home.place, candidates, "ranked");
      if (selection.kind !== "selected")
        throw new Error(
          "The saved home location could not be resolved for weather.",
        );
      const { location } = selection;
      const startAt = now.toISOString();
      const endAt = new Date(now.getTime() + 24 * 60 * 60_000).toISOString();
      const forecast = await provider.getForecast(
        { location, period: { endAt, startAt }, units: metricWeatherUnits },
        signal ? { signal } : {},
      );
      validateWeatherForecast(forecast, location, { endAt, startAt });
      const daily =
        forecast.daily.find(
          ({ date }) => date === localDate(now, location.timezone),
        ) ?? forecast.daily[0];
      const details = qualitativeWeatherDetails(forecast.current, "current");
      const citations = [
        { title: forecast.attribution.name, url: forecast.attribution.url },
      ];
      return {
        attention: details.length > 0 ? ["weather:today"] : [],
        facts: {
          weatherAttributionName: forecast.attribution.name,
          weatherAttributionUrl: forecast.attribution.url,
          weatherCondition: forecast.current.weather,
          weatherFetchedAt: forecast.fetchedAt,
          weatherLatitude: forecast.location.latitude,
          weatherLocation: forecast.location.name,
          weatherLongitude: forecast.location.longitude,
          weatherObservedAt: forecast.current.observedAt,
          weatherPeriodEndAt: forecast.period.endAt,
          weatherPeriodStartAt: forecast.period.startAt,
          weatherPrecipitation: forecast.current.precipitation,
          weatherPrecipitationUnit: forecast.units.precipitation,
          weatherTemperature: forecast.current.temperature,
          weatherTemperatureUnit: forecast.units.temperature,
          weatherTimeZone: forecast.location.timezone,
          weatherWindSpeed: forecast.current.windSpeed,
          weatherWindSpeedUnit: forecast.units.windSpeed,
          ...(daily
            ? {
                weatherDailyDate: daily.date,
                weatherMaximum: daily.temperatureMax,
                weatherMinimum: daily.temperatureMin,
                weatherDailyPrecipitation: daily.precipitation,
                weatherDailyWindSpeedMaximum: daily.windSpeedMax,
              }
            : {}),
        },
        items: [
          {
            citations,
            key: "weather:today",
            text: `${forecast.current.temperature}°C and ${forecast.current.weather} in ${forecast.location.name}${daily ? `, with a high of ${daily.temperatureMax}°C` : ""}, observed ${formatWeatherObservationAge(forecast.current.observedAt, now)}. ${details.join(" ")}${details.length > 0 ? " " : ""}Source: ${forecast.attribution.name}.`,
          },
        ],
        section: "weather",
      };
    },
  };
}

export function createInternetBriefingSource(
  search: InternetSearchPort,
  maxResults: number,
): BriefingSourcePort {
  return {
    section: "internet",
    read: async ({ signal, topic }) => {
      if (!topic) throw new Error("A briefing internet topic is required.");
      const response = await search.search(
        { maxResults: Math.min(2, maxResults), query: topic },
        signal ? { signal } : {},
      );
      validateInternetSearchResponse(response, Math.min(2, maxResults));
      const projection = projectInternetAnswer(response);
      return {
        attention: [],
        facts: { internetTopic: topic },
        items: [
          {
            citations: projection.citations,
            key: stableKey("internet", topic.toLocaleLowerCase()),
            text: `${topic}: ${projection.answer}`,
          },
        ],
        section: "internet",
      };
    },
  };
}

function projectInternetAnswer(response: InternetSearchResponse) {
  const answerLimit = 350;
  const retainedAnnotations = response.citations.filter(
    ({ endIndex }) => endIndex <= answerLimit,
  );
  if (response.citations.length > 0 && retainedAnnotations.length === 0) {
    return {
      answer: "No bounded cited update was available.",
      citations: [],
    };
  }
  const endIndex =
    retainedAnnotations.at(-1)?.endIndex ??
    Math.min(response.answer.length, answerLimit);
  const answer = sanitizeHumanTextMarkup(
    response.answer.slice(0, endIndex),
  ).trim();
  const sourceIds = new Set(
    retainedAnnotations.map(({ sourceId }) => sourceId),
  );
  return {
    answer: `${answer}${endIndex < response.answer.length ? "…" : ""}`,
    citations: response.sources
      .filter(({ id }) => sourceIds.has(id))
      .map(({ title, url }) => ({
        title: sanitizeHumanTextMarkup(title),
        url,
      })),
  };
}

function localDate(date: Date, timeZone: string): string {
  const parts = zonedParts(date, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function stableKey(section: BriefingSourceResult["section"], identity: string) {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (const character of identity) {
    const code = character.codePointAt(0)!;
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${section}:${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
}
