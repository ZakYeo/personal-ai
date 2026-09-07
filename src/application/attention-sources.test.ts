import { createWeatherProviderFixture } from "../test-support/weather.js";
import { createAttentionSourceReader } from "./attention-sources.js";
import type { CalendarEvent } from "../ports/calendar.js";

const now = new Date("2026-09-07T09:00:00.000Z");
const timeZone = "Europe/London";
const event: CalendarEvent = {
  id: "one",
  title: "Planning",
  startAt: "2026-09-07T09:10:00.000Z",
  startTime: "10:10",
  startDate: "2026-09-07",
  endAt: "2026-09-07T10:00:00.000Z",
};
function reader(events: CalendarEvent[]) {
  return createAttentionSourceReader({
    calendar: { searchEvents: vi.fn(() => Promise.resolve(events)) },
  });
}
describe("fixed proactive attention sources", () => {
  it("bounds upcoming events to the explicit lead time", async () => {
    const result = await reader([
      event,
      { ...event, id: "late", startAt: "2026-09-07T12:00:00.000Z" },
    ]).read(
      { definition: { kind: "upcoming_calendar", leadMinutes: 15 }, timeZone },
      { now },
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.facts).toMatchObject({
      title: "Planning",
      startAt: event.startAt,
    });
  });
  it("detects actual overlaps without guessing missing durations", async () => {
    const overlapping = {
      ...event,
      id: "two",
      title: "Review",
      startAt: "2026-09-07T09:30:00.000Z",
    };
    const result = await reader([event, overlapping]).read(
      {
        definition: { kind: "conflicting_commitments", lookAheadHours: 2 },
        timeZone,
      },
      { now },
    );
    expect(result).toHaveLength(1);
    const undated = { ...event };
    delete undated.endAt;
    expect(
      await reader([undated, overlapping]).read(
        {
          definition: { kind: "conflicting_commitments", lookAheadHours: 2 },
          timeZone,
        },
        { now },
      ),
    ).toEqual([]);
  });
  it("uses only open due tasks and never writes task state", async () => {
    const listTasks = vi.fn(() =>
      Promise.resolve([
        {
          id: "task",
          label: "Review",
          listId: "list",
          revision: 1,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
          status: "open" as const,
          dueDate: "2026-09-06",
        },
      ]),
    );
    const result = await createAttentionSourceReader({
      tasks: { listTasks },
    }).read(
      { definition: { kind: "due_tasks", daysAhead: 0 }, timeZone },
      { now },
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.facts).toMatchObject({
      dueDate: "2026-09-06",
      label: "Review",
    });
  });
  it("reports missing sources as failures rather than fabricated empty success", async () => {
    await expect(
      createAttentionSourceReader({}).read(
        {
          definition: { kind: "upcoming_calendar", leadMinutes: 15 },
          timeZone,
        },
        { now },
      ),
    ).rejects.toThrow("unavailable");
  });
  it("preserves fresh weather threshold facts and rejects stale observations", async () => {
    const weather = createWeatherProviderFixture();
    const base = weather.getForecast.bind(weather);
    weather.getForecast = async (request, options) => {
      const forecast = await base(request, options);
      return {
        ...forecast,
        fetchedAt: now.toISOString(),
        current: { ...forecast.current, observedAt: now.toISOString() },
        hourly: [
          {
            forecastAt: now.toISOString(),
            precipitation: 2,
            temperature: 18,
            weather: "rain",
            windSpeed: 5,
          },
        ],
      };
    };
    const location = (await weather.findLocations({ place: "London" }, {}))[0]!
      .location;
    const request = {
      definition: {
        kind: "material_weather" as const,
        location,
        condition: {
          metric: "precipitation" as const,
          operator: "atLeast" as const,
          unit: "mm" as const,
          threshold: 1,
        },
        periodHours: 2,
      },
      timeZone,
    };
    const source = createAttentionSourceReader({ weather });
    expect((await source.read(request, { now }))[0]?.facts).toMatchObject({
      threshold: 1,
      value: 2,
      unit: "mm",
      fetchedAt: now.toISOString(),
      location: "London",
    });
    weather.getForecast = base;
    await expect(source.read(request, { now })).rejects.toThrow("fresh");
  });
  it("does not read the morning workflow outside its explicit local minute", async () => {
    const read = vi.fn(() => Promise.resolve([]));
    const source = createAttentionSourceReader({ morning: { read } });
    await source.read(
      { definition: { kind: "morning_routine", localTime: "08:00" }, timeZone },
      { now },
    );
    expect(read).not.toHaveBeenCalled();
    await source.read(
      { definition: { kind: "morning_routine", localTime: "10:00" }, timeZone },
      { now },
    );
    expect(read).toHaveBeenCalledOnce();
  });
});
