import { createInternetSearchFeature } from "./internet-search-feature.js";
import type {
  InternetSearchPort,
  InternetSearchOptions,
  InternetSearchQuery,
} from "../../ports/internet-search.js";
import {
  createFeatureContext,
  expectCapabilityMetadata,
  expectDecodedFeatureExecution,
  expectFeatureRejects,
} from "../../test-support/feature-contract.js";

describe("createInternetSearchFeature", () => {
  it("declares a bounded read-only search capability", () => {
    const feature = createInternetSearchFeature(createFakeSearch());
    expectCapabilityMetadata(feature, {
      name: "internet.search",
      parameters: { query: { required: true, type: "string" } },
      risk: "low",
    });
    expect(
      feature.capabilities
        .filter((capability) => capability.name.startsWith("internet."))
        .every((capability) => capability.toolChain === undefined),
    ).toBe(true);
  });

  it("renders exact current-source citations and protected facts", async () => {
    const calls: InternetSearchQuery[] = [];

    await expectDecodedFeatureExecution(
      createInternetSearchFeature(createFakeSearch(calls), { maxResults: 3 }),
      "internet.search",
      { query: " TypeScript 5.7 " },
      {
        data: {
          answer:
            "TypeScript 5.7 adds checks for variables that have never been initialized. [1]",
          citation0EndIndex: 78,
          citation0SourceId: "provider-private-id",
          citation0StartIndex: 75,
          citationCount: 1,
          source0Extract:
            "TypeScript 5.7 adds checks for variables that have never been initialized.",
          source0PublishedAt: "2024-11-22T00:00:00.000Z",
          source0Title: "Announcing TypeScript 5.7",
          source0Url:
            "https://devblogs.microsoft.com/typescript/announcing-typescript-5-7/",
          sourceCount: 1,
        },
        expectsFollowUp: true,
        resultReferences: {
          items: [
            {
              facts: {
                extract:
                  "TypeScript 5.7 adds checks for variables that have never been initialized.",
                publishedAt: "2024-11-22T00:00:00.000Z",
                title: "Announcing TypeScript 5.7",
                url: "https://devblogs.microsoft.com/typescript/announcing-typescript-5-7/",
              },
              target: {
                kind: "internet_source",
                providerResultId: "provider-private-id",
              },
            },
          ],
          kind: "internet_sources",
        },
        text: "TypeScript 5.7 adds checks for variables that have never been initialized. [1] Sources: Announcing TypeScript 5.7 [1: https://devblogs.microsoft.com/typescript/announcing-typescript-5-7/].",
      },
      createFeatureContext(),
    );

    expect(calls).toEqual([{ maxResults: 3, query: "TypeScript 5.7" }]);
  });

  it("forwards the active request cancellation signal to search", async () => {
    const shutdown = new AbortController();
    let receivedOptions: InternetSearchOptions | undefined;
    const feature = createInternetSearchFeature({
      search: (_query, options) => {
        receivedOptions = options;
        return Promise.resolve({ answer: "", citations: [], sources: [] });
      },
    });

    await expectDecodedFeatureExecution(
      feature,
      "internet.search",
      { query: "current answer" },
      {
        resultReferences: { items: [], kind: "internet_sources" },
        text: 'I could not find current sources for "current answer".',
      },
      { ...createFeatureContext(), signal: shutdown.signal },
    );

    expect(receivedOptions).toEqual({ signal: shutdown.signal });
  });

  it("returns a graceful response when no current sources match", async () => {
    await expectDecodedFeatureExecution(
      createInternetSearchFeature(createFakeSearch([], [])),
      "internet.search",
      { query: "no results" },
      {
        resultReferences: {
          items: [],
          kind: "internet_sources",
        },
        text: 'I could not find current sources for "no results".',
      },
    );
  });

  it("rejects an empty query before calling the provider", async () => {
    await expectFeatureRejects(
      createInternetSearchFeature(createFakeSearch()),
      {
        capability: "internet.search",
        parameters: { query: " " },
        rawText: "search",
      },
      { query: " " },
      "Internet search requires a non-empty query.",
    );
  });

  it("rejects overlong queries before calling the provider", async () => {
    const calls: InternetSearchQuery[] = [];

    await expectFeatureRejects(
      createInternetSearchFeature(createFakeSearch(calls)),
      {
        capability: "internet.search",
        parameters: { query: "x".repeat(501) },
        rawText: "search",
      },
      { query: "x".repeat(501) },
      "Internet search queries must not exceed 500 characters.",
    );
    expect(calls).toEqual([]);
  });

  it("rejects citations outside the current bounded source set", async () => {
    await expectFeatureRejects(
      createInternetSearchFeature({
        search: () =>
          Promise.resolve({
            answer: "Answer [1]",
            citations: [{ endIndex: 10, sourceId: "missing", startIndex: 7 }],
            sources: [
              {
                id: "current",
                title: "Current",
                url: "https://example.com/current",
              },
            ],
          }),
      }),
      {
        capability: "internet.search",
        parameters: { query: "current answer" },
        rawText: "search",
      },
      { query: "current answer" },
      "Internet search returned citations that do not resolve to its source set.",
    );
  });

  it("rejects oversized answer projections from every adapter", async () => {
    await expectFeatureRejects(
      createInternetSearchFeature({
        search: () =>
          Promise.resolve({
            answer: "x".repeat(4_001),
            citations: [{ endIndex: 3, sourceId: "current", startIndex: 0 }],
            sources: [
              {
                id: "current",
                title: "Current",
                url: "https://example.com/current",
              },
            ],
          }),
      }),
      {
        capability: "internet.search",
        parameters: { query: "current answer" },
        rawText: "search",
      },
      { query: "current answer" },
      "Internet search returned content outside safe bounds.",
    );
  });

  it("answers follow-ups only through a selected opaque source reference", async () => {
    await expectDecodedFeatureExecution(
      createInternetSearchFeature(createFakeSearch()),
      "internet.follow_up",
      { ordinal: 1 },
      {
        data: {
          extract:
            "TypeScript 5.7 adds checks for variables that have never been initialized.",
          publishedAt: "2024-11-22T00:00:00.000Z",
          title: "Announcing TypeScript 5.7",
          url: "https://devblogs.microsoft.com/typescript/announcing-typescript-5-7/",
        },
        text: "Announcing TypeScript 5.7: TypeScript 5.7 adds checks for variables that have never been initialized. [https://devblogs.microsoft.com/typescript/announcing-typescript-5-7/]",
      },
      {
        ...createFeatureContext(),
        selectResultReference: () => ({
          publicReference: {
            facts: {
              extract:
                "TypeScript 5.7 adds checks for variables that have never been initialized.",
              publishedAt: "2024-11-22T00:00:00.000Z",
              title: "Announcing TypeScript 5.7",
              url: "https://devblogs.microsoft.com/typescript/announcing-typescript-5-7/",
            },
            kind: "internet_source",
            ordinal: 1,
            reference: "internet-source-1",
          },
          target: {
            kind: "internet_source",
            providerResultId: "provider-private-id",
          },
        }),
      },
    );
  });

  it("asks for clarification rather than guessing a source", async () => {
    await expectDecodedFeatureExecution(
      createInternetSearchFeature(createFakeSearch()),
      "internet.follow_up",
      {},
      {
        expectsFollowUp: true,
        text: "I am not sure which recent internet source you mean.",
      },
    );
  });

  it("does not attribute the whole synthesized answer to a source without an extract", async () => {
    await expectDecodedFeatureExecution(
      createInternetSearchFeature(createFakeSearch()),
      "internet.follow_up",
      { ordinal: 1 },
      {
        data: {
          title: "Current source",
          url: "https://example.com/current",
        },
        text: "Current source was cited in the recent answer. [https://example.com/current]",
      },
      {
        ...createFeatureContext(),
        selectResultReference: () => ({
          publicReference: {
            facts: {
              title: "Current source",
              url: "https://example.com/current",
            },
            kind: "internet_source",
            ordinal: 1,
            reference: "internet-source-1",
          },
          target: {
            kind: "internet_source",
            providerResultId: "snapshot-only",
          },
        }),
      },
    );
  });
});

function createFakeSearch(
  calls: InternetSearchQuery[] = [],
  sources = [
    {
      extract:
        "TypeScript 5.7 adds checks for variables that have never been initialized.",
      id: "provider-private-id",
      publishedAt: "2024-11-22T00:00:00.000Z",
      title: "Announcing TypeScript 5.7",
      url: "https://devblogs.microsoft.com/typescript/announcing-typescript-5-7/",
    },
  ],
): InternetSearchPort {
  return {
    search: (query) => {
      calls.push(query);
      const answer =
        sources.length === 0
          ? ""
          : `${sources[0]!.extract ?? sources[0]!.title} [1]`;
      return Promise.resolve({
        answer,
        citations:
          sources.length === 0
            ? []
            : [
                {
                  endIndex: answer.length,
                  sourceId: sources[0]!.id,
                  startIndex: answer.length - 3,
                },
              ],
        sources,
      });
    },
  };
}
