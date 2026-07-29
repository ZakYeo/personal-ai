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

  it("uses the first URL for duplicate citation titles without nesting links", () => {
    const rendered = renderAssistantResponseText(
      {
        citations: [
          { title: "Same source", url: "https://first.example/source" },
          { title: "Same source", url: "https://second.example/source" },
        ],
        status: "ok",
        text: "Same source and Same source.",
      },
      { hyperlinks: true },
    );

    expect(rendered.split("\u001B]8;;")).toHaveLength(5);
    expect(rendered).toContain("https://first.example/source");
    expect(rendered).not.toContain("https://second.example/source");
  });

  it("renders overlapping citation titles once with longest-title precedence", () => {
    const rendered = renderAssistantResponseText(
      {
        citations: [
          { title: "Trump", url: "https://short.example/source" },
          {
            title: "Donald Trump",
            url: "https://long.example/source",
          },
        ],
        status: "ok",
        text: "Donald Trump and Trump.",
      },
      { hyperlinks: true },
    );

    expect(rendered.split("\u001B]8;;")).toHaveLength(5);
    expect(rendered).toContain(
      "\u001B]8;;https://long.example/source\u0007Donald Trump\u001B]8;;\u0007",
    );
    expect(rendered).toContain(
      "\u001B]8;;https://short.example/source\u0007Trump\u001B]8;;\u0007",
    );
  });
});
