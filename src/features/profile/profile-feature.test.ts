import {
  createFeatureContext,
  executeFeature,
  expectCapabilityMetadata,
} from "../../test-support/feature-contract.js";
import { createProfileStoreFixture } from "../../test-support/profile-store.js";
import { createProfileFeature } from "./profile-feature.js";

const now = new Date("2026-08-05T12:00:00.000Z");
const context = {
  ...createFeatureContext(),
  clock: { now: () => now },
};

describe("createProfileFeature", () => {
  it("declares bounded set, lookup, show, explain, forget, and confirmed clear capabilities", () => {
    const feature = createTestFeature();

    expectCapabilityMetadata(feature, {
      name: "profile.set",
      parameters: {
        field: { required: true, type: "string" },
        value: { required: true, type: "string" },
      },
      risk: "low",
    });
    expectCapabilityMetadata(feature, {
      name: "profile.lookup",
      parameters: { field: { required: true, type: "string" } },
      risk: "low",
      toolChain: "read",
      toolOnly: true,
    });
    expectCapabilityMetadata(feature, {
      name: "profile.show",
      parameters: { field: { type: "string" } },
      risk: "low",
    });
    expectCapabilityMetadata(feature, {
      name: "profile.clear",
      parameters: {},
      requiresConfirmation: true,
      risk: "high",
    });
  });

  it("returns one narrow stored fact as a safe tool observation", async () => {
    const store = createProfileStoreFixture({ now: () => now });
    const feature = createProfileFeature(store);
    await store.set({ field: "preferredName", value: "Zak" });

    await expect(
      executeFeature(
        feature,
        "profile.lookup",
        { field: "preferredName" },
        context,
      ),
    ).resolves.toEqual({
      responseRewrite: "disabled",
      text: "Your preferred name is Zak.",
      toolObservationData: {
        field: "preferredName",
        found: true,
        provenance: "user-authored",
        value: "Zak",
      },
    });
  });

  it("declares a general save-and-resume clarification for a missing fact", async () => {
    await expect(
      executeFeature(
        createTestFeature(),
        "profile.lookup",
        { field: "homeLocation" },
        context,
      ),
    ).resolves.toEqual({
      responseRewrite: "disabled",
      text: "I don’t have your home location stored.",
      toolClarification: {
        prompt:
          "What is your home location? I’ll save it to your profile and then continue.",
        replyCommand: {
          capability: "profile.set",
          fixedParameters: { field: "homeLocation" },
          replyParameter: "value",
        },
      },
      toolObservationData: { field: "homeLocation", found: false },
    });
  });

  it.each([
    ["preferredName", "Zak", "I’ll remember that your preferred name is Zak."],
    [
      "birthDate",
      "1990-08-06",
      "I’ll remember your birth date as 6 August 1990.",
    ],
    [
      "pronouns",
      "they/them",
      "I’ll remember that your pronouns are they/them.",
    ],
    [
      "homeTimeZone",
      "Europe/London",
      "I’ll remember Europe/London as your home timezone.",
    ],
    ["homeLocation", "London", "I’ll remember London as your home location."],
    ["interest", "Cycling", "I’ll remember that you’re interested in Cycling."],
    ["responseStyle", "concise", "I’ll keep my responses concise."],
  ] as const)("sets the %s profile fact", async (field, value, text) => {
    const result = await executeFeature(
      createTestFeature(),
      "profile.set",
      { field, value },
      context,
    );

    expect(result).toMatchObject({
      data: { field, value },
      responseRewrite: "disabled",
      text,
    });
  });

  it("shows a concise whole-profile summary", async () => {
    const store = createProfileStoreFixture({ now: () => now });
    const feature = createProfileFeature(store);
    await store.set({ field: "preferredName", value: "Zak" });
    await store.set({ field: "interest", value: "Cycling" });
    await store.set({ field: "interest", value: "Photography" });
    await store.set({ field: "responseStyle", value: "concise" });

    await expect(
      executeFeature(feature, "profile.show", {}, context),
    ).resolves.toMatchObject({
      responseRewrite: "disabled",
      text: "I know your preferred name is Zak, you’re interested in Cycling and Photography, and you prefer concise responses.",
    });
  });

  it("derives age from birth date and the stored home timezone", async () => {
    const store = createProfileStoreFixture({
      now: () => new Date("2026-08-05T23:30:00.000Z"),
    });
    const feature = createProfileFeature(store);
    await store.set({ field: "birthDate", value: "1990-08-06" });
    await store.set({ field: "homeTimeZone", value: "Europe/London" });

    await expect(
      executeFeature(
        feature,
        "profile.show",
        { field: "age" },
        {
          ...context,
          clock: { now: () => new Date("2026-08-05T23:30:00.000Z") },
        },
      ),
    ).resolves.toMatchObject({
      data: { age: 36, birthDate: "1990-08-06" },
      text: "You’re 36 years old.",
    });
  });

  it("explains user-authored provenance without retaining the utterance", async () => {
    const store = createProfileStoreFixture({ now: () => now });
    const feature = createProfileFeature(store);
    await store.set({ field: "preferredName", value: "Zak" });

    await expect(
      executeFeature(
        feature,
        "profile.explain",
        { field: "preferredName" },
        context,
      ),
    ).resolves.toMatchObject({
      text: "I know your preferred name is Zak because you explicitly asked me to remember it on 5 August 2026.",
    });
  });

  it("forgets an individual interest", async () => {
    const store = createProfileStoreFixture({ now: () => now });
    const feature = createProfileFeature(store);
    await store.set({ field: "interest", value: "Cycling" });

    await expect(
      executeFeature(
        feature,
        "profile.forget",
        { field: "interest", value: "cycling" },
        context,
      ),
    ).resolves.toMatchObject({
      text: "I’ve forgotten your interest in Cycling.",
    });
  });

  it("clears the profile only through the separately confirmed capability", async () => {
    const store = createProfileStoreFixture({ now: () => now });
    const feature = createProfileFeature(store);
    await store.set({ field: "preferredName", value: "Zak" });
    const clearCapability = feature.capabilities.find(
      ({ name }) => name === "profile.clear",
    );

    expect(clearCapability?.renderConfirmation?.({}, context)).toEqual({
      facts: { scope: "complete personal profile" },
      text: "Clear your complete personal profile?",
    });
    await expect(
      executeFeature(feature, "profile.clear", {}, context),
    ).resolves.toMatchObject({ text: "I’ve cleared your personal profile." });
    await expect(store.list()).resolves.toEqual([]);
  });

  it("rejects unknown fields and missing interest selectors", async () => {
    const feature = createTestFeature();

    await expect(
      executeFeature(
        feature,
        "profile.set",
        { field: "favoriteColor", value: "blue" },
        context,
      ),
    ).rejects.toThrow("Profile field is not supported.");
    await expect(
      executeFeature(feature, "profile.forget", { field: "interest" }, context),
    ).rejects.toThrow("Specify the interest to forget.");
  });
});

function createTestFeature() {
  return createProfileFeature(createProfileStoreFixture({ now: () => now }));
}
