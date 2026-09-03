import { parseCalendarEventGrouping } from "../../application/calendar-event-grouping-policy.js";
import type { CalendarEventGroupingInput } from "../../ports/calendar-event-grouper.js";
import { OpenAICalendarEventGrouperError } from "./openai-calendar-event-grouper-error.js";
import { parseValidatedOpenAIStructuredOutput } from "./openai-structured-output-parser.js";

export function parseOpenAICalendarEventGrouping(
  value: string,
  events: CalendarEventGroupingInput["events"],
) {
  return parseValidatedOpenAIStructuredOutput(value, {
    createError: ({ cause, message, responseBody }) =>
      new OpenAICalendarEventGrouperError(message, undefined, responseBody, {
        cause,
      }),
    invalidJsonMessage: "OpenAI calendar event grouping was not valid JSON.",
    invalidOutputMessage: "OpenAI calendar event grouping was invalid.",
    validate: (parsed) => parseCalendarEventGrouping(parsed, events),
  });
}
