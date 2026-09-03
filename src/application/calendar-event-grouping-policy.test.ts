import { parseCalendarEventGrouping } from "./calendar-event-grouping-policy.js";
import type { CalendarEventGroupingInput } from "../ports/calendar-event-grouper.js";

const events = [
  {
    index: 0,
    startDate: "2026-11-13",
    startTime: "12:30",
    title: "Guest arrival",
  },
  { index: 1, startDate: "2026-11-13", startTime: "13:00", title: "Ceremony" },
  {
    index: 2,
    startDate: "2026-11-13",
    startTime: "15:20",
    title: "Wedding breakfast",
  },
  {
    index: 3,
    startDate: "2026-11-13",
    startTime: "19:10",
    title: "Evening reception",
  },
  { index: 4, startDate: "2026-11-14", startTime: "09:00", title: "Dentist" },
] as const satisfies CalendarEventGroupingInput["events"];

describe("calendar event grouping policy", () => {
  it("accepts bounded same-day groups with chronological milestones", () => {
    expect(
      parseCalendarEventGrouping(
        {
          groups: [
            {
              eventIndexes: [0, 1, 2, 3],
              milestones: [
                { eventIndex: 0, label: "guest arrival" },
                { eventIndex: 1, label: "the ceremony" },
                { eventIndex: 2, label: "the wedding breakfast" },
                { eventIndex: 3, label: "the evening reception" },
              ],
              theme: "the wedding",
            },
          ],
        },
        events,
      ),
    ).toEqual({
      groups: [
        {
          eventIndexes: [0, 1, 2, 3],
          milestones: [
            { eventIndex: 0, label: "guest arrival" },
            { eventIndex: 1, label: "the ceremony" },
            { eventIndex: 2, label: "the wedding breakfast" },
            { eventIndex: 3, label: "the evening reception" },
          ],
          theme: "the wedding",
        },
      ],
    });
  });

  it.each([
    [
      "cross-date groups",
      {
        groups: [
          {
            eventIndexes: [3, 4],
            milestones: [
              { eventIndex: 3, label: "one" },
              { eventIndex: 4, label: "two" },
            ],
            theme: "appointments",
          },
        ],
      },
    ],
    [
      "overlapping groups",
      {
        groups: [
          {
            eventIndexes: [0, 1],
            milestones: [
              { eventIndex: 0, label: "one" },
              { eventIndex: 1, label: "two" },
            ],
            theme: "first",
          },
          {
            eventIndexes: [1, 2],
            milestones: [
              { eventIndex: 1, label: "one" },
              { eventIndex: 2, label: "two" },
            ],
            theme: "second",
          },
        ],
      },
    ],
    [
      "milestones outside their group",
      {
        groups: [
          {
            eventIndexes: [0, 1],
            milestones: [
              { eventIndex: 0, label: "one" },
              { eventIndex: 2, label: "two" },
            ],
            theme: "wedding",
          },
        ],
      },
    ],
    [
      "unsafe labels",
      {
        groups: [
          {
            eventIndexes: [0, 1],
            milestones: [
              { eventIndex: 0, label: "https://secret.test" },
              { eventIndex: 1, label: "two" },
            ],
            theme: "wedding",
          },
        ],
      },
    ],
    [
      "emoji labels",
      {
        groups: [
          {
            eventIndexes: [0, 1],
            milestones: [
              { eventIndex: 0, label: "💍 ceremony" },
              { eventIndex: 1, label: "two" },
            ],
            theme: "wedding",
          },
        ],
      },
    ],
  ])("rejects %s", (_name, value) => {
    expect(() => parseCalendarEventGrouping(value, events)).toThrow();
  });
});
