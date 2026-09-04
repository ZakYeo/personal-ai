import type { AlarmStore } from "../ports/alarm-store.js";
import type { BriefingSourcePort } from "../ports/briefing.js";
import type { CalendarSearchPort } from "../ports/calendar.js";
import type { InternetSearchPort } from "../ports/internet-search.js";
import type { PersonalContextReaderPort } from "../ports/personal-context.js";
import type { ProfileStorePort } from "../ports/profile-store.js";
import type { TaskStore } from "../ports/task-store.js";
import type { WeatherProviderPort } from "../ports/weather.js";
import type { AssistantCommandParameters } from "../ports/assistant.js";
import { zonedParts } from "./local-date-time.js";
import { sanitizeHumanTextMarkup } from "./human-text.js";
import {
  metricWeatherUnits,
  validateWeatherForecast,
} from "./weather-policy.js";

export function createProfileBriefingSource(
  store: ProfileStorePort,
): BriefingSourcePort {
  return {
    section: "profile",
    read: async () => {
      const facts = await store.list();
      const preferredName = facts.find(
        ({ field }) => field === "preferredName",
      )?.value;
      const homeLocation = facts.find(
        ({ field }) => field === "homeLocation",
      )?.value;
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
        .map((event, index) => ({ event, key: `calendar:${index}` }))
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
            : events.map((event, index) => ({
                key: `calendar:${index}`,
                text: `${event.title} is ${event.startAt ? `at ${event.startAt}` : "all day"}.`,
              })),
        section: "calendar",
      };
    },
  };
}

export function createAlarmBriefingSource(
  store: AlarmStore,
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
        .map((alarm, index) => ({ alarm, key: `alarm:${index}` }))
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
            : alarms.map((alarm, index) => ({
                key: `alarm:${index}`,
                text: `${alarm.label} is set for ${alarm.scheduledFor}.`,
              })),
        section: "alarms",
      };
    },
  };
}

export function createTaskBriefingSource(store: TaskStore): BriefingSourcePort {
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
        attention: tasks.map((_, index) => `task:${index}`),
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
            : tasks.map((task, index) => ({
                key: `task:${index}`,
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
      const location = [...candidates].sort(
        (left, right) => left.providerRank - right.providerRank,
      )[0]?.location;
      if (!location)
        throw new Error(
          "The saved home location could not be resolved for weather.",
        );
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
      const notable =
        forecast.current.precipitation > 0 || forecast.current.windSpeed >= 40;
      return {
        attention: notable ? ["weather:today"] : [],
        citations: [
          { title: forecast.attribution.name, url: forecast.attribution.url },
        ],
        facts: {
          weatherCondition: forecast.current.weather,
          weatherFetchedAt: forecast.fetchedAt,
          weatherLocation: forecast.location.name,
          weatherTemperature: forecast.current.temperature,
          ...(daily
            ? {
                weatherMaximum: daily.temperatureMax,
                weatherMinimum: daily.temperatureMin,
              }
            : {}),
        },
        items: [
          {
            key: "weather:today",
            text: `${forecast.current.temperature}°C and ${forecast.current.weather} in ${forecast.location.name}${daily ? `, with a high of ${daily.temperatureMax}°C` : ""}. Source: ${forecast.attribution.name}.`,
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
      const answer = sanitizeHumanTextMarkup(response.answer).trim();
      return {
        attention: [],
        citations: response.sources.slice(0, 2).map(({ title, url }) => ({
          title: sanitizeHumanTextMarkup(title),
          url,
        })),
        facts: { internetTopic: topic },
        items: [
          {
            key: `internet:${topic.toLocaleLowerCase()}`,
            text: `${topic}: ${answer}`,
          },
        ],
        section: "internet",
      };
    },
  };
}

function localDate(date: Date, timeZone: string): string {
  const parts = zonedParts(date, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}
