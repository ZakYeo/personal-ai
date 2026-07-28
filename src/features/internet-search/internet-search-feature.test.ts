import { createInternetSearchFeature } from "./internet-search-feature.js";
import type {
  InternetSearchPort,
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
        text: "Announcing TypeScript 5.7: TypeScript 5.7 adds checks for variables that have never been initialized. [1: https://devblogs.microsoft.com/typescript/announcing-typescript-5-7/]",
      },
      createFeatureContext(),
    );

    expect(calls).toEqual([{ maxResults: 3, query: "TypeScript 5.7" }]);
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
});

function createFakeSearch(
  calls: InternetSearchQuery[] = [],
  results = [
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
      return Promise.resolve(results);
    },
  };
}
