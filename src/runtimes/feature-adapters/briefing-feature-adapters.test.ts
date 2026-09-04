import type { CalendarSearchPort } from "../../ports/calendar.js";
import {
  bindRuntimeService,
  createRuntimeServiceRegistry,
} from "../runtime-service-registry.js";
import { calendarSearchService } from "../feature-source-services.js";
import { createBriefingSources } from "./briefing-feature-adapters.js";

describe("briefing feature source composition", () => {
  it("omits disabled sources and reads through the exact shared service", async () => {
    expect(createBriefingSources(createRuntimeServiceRegistry([]))).toEqual([]);
    const searchEvents = vi.fn(() => Promise.resolve([]));
    const calendar: CalendarSearchPort = {
      getEvent: () => Promise.resolve(undefined),
      searchEvents,
    };
    const sources = createBriefingSources(
      createRuntimeServiceRegistry([
        bindRuntimeService(calendarSearchService, calendar),
      ]),
    );

    expect(sources.map(({ section }) => section)).toEqual(["calendar"]);
    await sources[0]!.read({
      now: new Date("2026-09-04T07:00:00.000Z"),
      timeZone: "Europe/London",
    });
    expect(searchEvents).toHaveBeenCalledOnce();
  });
});
