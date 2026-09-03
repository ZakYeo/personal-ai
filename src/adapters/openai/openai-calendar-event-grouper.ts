import type {
  CalendarEventGrouperPort,
  CalendarEventGroupingInput,
} from "../../ports/calendar-event-grouper.js";
import { extractOpenAIOutputText } from "./openai-output-extractor.js";
import type { OpenAIResponsesConfig } from "./openai-responses-config.js";
import { requestOpenAIResponse } from "./openai-responses-client.js";
import { OpenAICalendarEventGrouperError } from "./openai-calendar-event-grouper-error.js";
import { parseOpenAICalendarEventGrouping } from "./openai-calendar-event-grouper-parser.js";
import { createOpenAICalendarEventGroupingRequestBody } from "./openai-calendar-event-grouper-request.js";

interface OpenAICalendarEventGrouperOptions {
  config: OpenAIResponsesConfig;
  env: Record<string, string | undefined>;
  fetch: typeof fetch;
}

export class OpenAICalendarEventGrouper implements CalendarEventGrouperPort {
  constructor(private readonly options: OpenAICalendarEventGrouperOptions) {}

  async group(
    input: CalendarEventGroupingInput,
    options: { readonly signal?: AbortSignal } = {},
  ) {
    const response = await requestOpenAIResponse({
      body: createOpenAICalendarEventGroupingRequestBody(
        input,
        this.options.config,
      ),
      cancelledMessage: "OpenAI calendar event grouping was cancelled.",
      config: this.options.config,
      createError: ({ cause, message, requestId, responseBody, status }) =>
        new OpenAICalendarEventGrouperError(message, status, responseBody, {
          cause,
          ...(requestId ? { requestId } : {}),
        }),
      env: this.options.env,
      fetch: this.options.fetch,
      operation: "calendar event grouping",
      ...(options.signal ? { signal: options.signal } : {}),
    });
    const output = extractOpenAIOutputText(response, {
      createError: (message) => new OpenAICalendarEventGrouperError(message),
      missingMessage:
        "OpenAI calendar event grouping response did not include output text.",
      notObjectMessage:
        "OpenAI calendar event grouping response body must be an object.",
    });
    return parseOpenAICalendarEventGrouping(output, input.events);
  }
}
