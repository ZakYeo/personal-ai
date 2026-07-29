import type { AssistantResponse } from "../ports/assistant.js";
import { renderAssistantResponseText } from "./assistant-response-rendering.js";

const response: AssistantResponse = {
  citations: [
    {
      title: "Donald Trump",
      url: "https://en.wikipedia.org/wiki/Donald_Trump?utm_source=openai",
    },
  ],
  status: "ok",
  text: "Donald Trump was born on June 14, 1946. Source: Donald Trump.",
};

describe("assistant response rendering", () => {
  it("keeps plain output readable without exposing a raw citation URL", () => {
    expect(renderAssistantResponseText(response)).toBe(response.text);
  });

  it("renders citation titles as terminal hyperlinks without printing the URL", () => {
    const rendered = renderAssistantResponseText(response, {
      hyperlinks: true,
    });

    expect(rendered).toContain(
      "\u001B]8;;https://en.wikipedia.org/wiki/Donald_Trump?utm_source=openai\u0007Donald Trump\u001B]8;;\u0007",
    );
    expect(
      rendered
        .replaceAll(
          "\u001B]8;;https://en.wikipedia.org/wiki/Donald_Trump?utm_source=openai\u0007",
          "",
        )
        .replaceAll("\u001B]8;;\u0007", ""),
    ).toBe(response.text);
  });

  it("does not render unsafe citation metadata as terminal control sequences", () => {
    expect(
      renderAssistantResponseText(
        {
          citations: [
            {
              title: "Unsafe",
              url: "https://example.com/\u001B]8;;https://attacker.test\u0007",
            },
          ],
          status: "ok",
          text: "Unsafe citation.",
        },
        { hyperlinks: true },
      ),
    ).toBe("Unsafe citation.");
  });
});
