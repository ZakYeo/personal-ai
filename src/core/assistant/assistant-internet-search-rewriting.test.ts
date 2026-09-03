import { createCapabilityRoutingIndex } from "../../application/capability-catalog.js";
import { createInternetSearchFeature } from "../../features/internet-search/internet-search-feature.js";
import {
  createAssistantConfig,
  createFixedClock,
} from "../../test-support/core-assistant.js";
import { createAssistant } from "./assistant.js";

describe("assistant internet-search rewriting", () => {
  it("does not send grounded search answers or source follow-ups to the response rewriter", async () => {
    const rewrite = vi.fn(() =>
      Promise.resolve({ text: "Unsupported rewritten claim." }),
    );
    const feature = createInternetSearchFeature({
      search: () =>
        Promise.resolve({
          answer: "TypeScript 5.7 is available. [1]",
          citations: [{ endIndex: 32, sourceId: "source-1", startIndex: 29 }],
          sources: [
            {
              extract: "TypeScript 5.7 is available.",
              id: "source-1",
              title: "TypeScript release notes",
              url: "https://example.com/typescript",
            },
          ],
        }),
    });
    const assistant = createAssistant({
      capabilityRouting: createCapabilityRoutingIndex([feature]),
      clock: createFixedClock(),
      config: createAssistantConfig({ internetSearch: { enabled: true } }),
      intentInterpreter: {
        start: (text) => ({
          next: () =>
            Promise.resolve(
              text === "search TypeScript"
                ? {
                    command: {
                      capability: "internet.search",
                      parameters: { query: "TypeScript 5.7" },
                      rawText: text,
                    },
                    kind: "command" as const,
                  }
                : {
                    command: {
                      capability: "internet.follow_up",
                      parameters: { ordinal: 1 },
                      rawText: text,
                    },
                    kind: "command" as const,
                  },
            ),
        }),
      },
      responseRewriter: { rewrite },
    });

    await expect(assistant.handleText("search TypeScript")).resolves.toEqual({
      citations: [
        {
          title: "TypeScript release notes",
          url: "https://example.com/typescript",
        },
      ],
      status: "ok",
      text: "TypeScript 5.7 is available. Source: TypeScript release notes.",
    });
    await expect(assistant.handleText("the first source")).resolves.toEqual({
      citations: [
        {
          title: "TypeScript release notes",
          url: "https://example.com/typescript",
        },
      ],
      status: "ok",
      text: "TypeScript release notes: TypeScript 5.7 is available.",
    });
    expect(rewrite).not.toHaveBeenCalled();
  });
});
