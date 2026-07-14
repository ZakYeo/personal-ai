import { createAssistant } from "./assistant.js";
import { createCapabilityRoutingIndex } from "../../ports/capability-catalog.js";
import type { AssistantContext } from "../../ports/assistant.js";
import type { FeaturePlugin } from "../../ports/feature.js";
import {
  createAssistantConfig,
  createCommand,
  createConversationCompactor,
  createFeature,
  createFixedClock,
} from "../../test-support/core-assistant.js";

describe("assistant result references", () => {
  it("exposes safe opaque references only to later intents and expires them", async () => {
    const contexts: AssistantContext[] = [];
    let call = 0;
    const assistant = createReferenceAssistant(contexts, () =>
      call++ === 0
        ? { command: createCommand(), kind: "command" as const }
        : unknownInterpretation,
    );

    await assistant.handleText("show events");
    await assistant.handleText("the first one");

    expect(contexts[1]?.resultReferences).toEqual([
      {
        facts: { date: "2026-07-17", time: "11:00", title: "Dentist" },
        kind: "calendar_event",
        ordinal: 1,
        reference: "calendar-event-1",
      },
    ]);
    expect(JSON.stringify(contexts[1])).not.toContain("provider-secret-id");

    await assistant.handleText("turn two");
    await assistant.handleText("turn three");
    await assistant.handleText("expired");
    expect(contexts[4]?.resultReferences).toBeUndefined();
  });

  it("keeps references process-local to one assistant instance", async () => {
    const contexts: AssistantContext[] = [];
    const first = createReferenceAssistant(contexts, () => ({
      command: createCommand(),
      kind: "command" as const,
    }));
    const secondContexts: AssistantContext[] = [];
    const second = createReferenceAssistant(
      secondContexts,
      () => unknownInterpretation,
    );

    await first.handleText("show events");
    await second.handleText("the first one");

    expect(secondContexts[0]?.resultReferences).toBeUndefined();
  });

  it("serializes reference retention before a concurrent follow-up", async () => {
    const contexts: AssistantContext[] = [];
    let call = 0;
    const assistant = createReferenceAssistant(contexts, () =>
      call++ === 0
        ? { command: createCommand(), kind: "command" as const }
        : unknownInterpretation,
    );

    await Promise.all([
      assistant.handleText("show events"),
      assistant.handleText("the first one"),
    ]);

    expect(contexts[1]?.resultReferences?.[0]?.reference).toBe(
      "calendar-event-1",
    );
  });

  it("clears references immediately when conversation compacts", async () => {
    const contexts: AssistantContext[] = [];
    let call = 0;
    const assistant = createReferenceAssistant(
      contexts,
      () =>
        call++ === 0
          ? { command: createCommand(), kind: "command" as const }
          : call === 2
            ? { kind: "conversation" as const }
            : unknownInterpretation,
      true,
    );

    await assistant.handleText("show events");
    await assistant.handleText("tell me something");
    await assistant.handleText("the first one");

    expect(contexts[2]?.resultReferences).toBeUndefined();
  });

  it("rejects a provider-forged ordinal that is absent from the trusted utterance", async () => {
    let call = 0;
    const feature = createForgedReferenceFeature();
    const assistant = createAssistant({
      capabilityRouting: createCapabilityRoutingIndex([feature]),
      clock: createFixedClock(),
      config: createAssistantConfig({ calendar: { enabled: true } }),
      intentInterpreter: {
        interpret: () =>
          Promise.resolve(
            call++ === 0
              ? {
                  command: createCommand("calendar.search", {}, "show events"),
                  kind: "command" as const,
                }
              : {
                  command: createCommand(
                    "calendar.follow_up",
                    { ordinal: 2, reference: "calendar-event-2" },
                    "the second one",
                  ),
                  kind: "command" as const,
                },
          ),
      },
    });

    await assistant.handleText("show events");

    await expect(assistant.handleText("Where is that?")).resolves.toEqual({
      expectsFollowUp: true,
      status: "ok",
      text: "I am not sure which event you mean.",
    });
  });
});

const unknownInterpretation = {
  kind: "unknown" as const,
  response: { status: "unknown" as const, text: "Unknown." },
};

function createReferenceAssistant(
  contexts: AssistantContext[],
  interpret: () =>
    | typeof unknownInterpretation
    | { command: ReturnType<typeof createCommand>; kind: "command" }
    | { kind: "conversation" },
  conversation = false,
) {
  const feature = createFeature({
    execute: () =>
      Promise.resolve({
        resultReferences: {
          items: [
            {
              facts: {
                date: "2026-07-17",
                time: "11:00",
                title: "Dentist",
              },
              target: {
                kind: "calendar_event" as const,
                providerEventId: "provider-secret-id",
              },
            },
          ],
          kind: "calendar_events" as const,
        },
        text: "Dentist is on 2026-07-17.",
      }),
  });

  return createAssistant({
    capabilityRouting: createCapabilityRoutingIndex([feature]),
    clock: createFixedClock(),
    config: createAssistantConfig(),
    ...(conversation
      ? {
          conversation: {
            compactor: createConversationCompactor(),
            history: { maxTurnsBeforeCompaction: 1 },
            responder: {
              respond: () => Promise.resolve({ status: "ok", text: "Chat." }),
            },
          },
        }
      : {}),
    intentInterpreter: {
      interpret: (_text, context) => {
        contexts.push(context);
        return Promise.resolve(interpret());
      },
    },
  });
}

function createForgedReferenceFeature(): FeaturePlugin {
  return {
    capabilities: [
      { name: "calendar.search", parameters: {}, risk: "low" },
      {
        name: "calendar.follow_up",
        parameters: {
          ordinal: { type: "number" },
          reference: { type: "string" },
        },
        risk: "low",
      },
    ],
    displayName: "Calendar",
    execute: (request, context) => {
      if (request.capability === "calendar.search") {
        return Promise.resolve({
          resultReferences: {
            items: ["First", "Second"].map((title) => ({
              facts: { date: "2026-07-17", time: "11:00", title },
              target: {
                kind: "calendar_event" as const,
                providerEventId: title,
              },
            })),
            kind: "calendar_events",
          },
          text: "Two events.",
        });
      }

      const selected = context.selectResultReference?.({
        ...(typeof request.args.ordinal === "number"
          ? { ordinal: request.args.ordinal }
          : {}),
        rawText: context.trustedInputText,
        ...(typeof request.args.reference === "string"
          ? { reference: request.args.reference }
          : {}),
      });
      return Promise.resolve(
        selected
          ? { text: selected.publicReference.facts.title }
          : {
              expectsFollowUp: true,
              text: "I am not sure which event you mean.",
            },
      );
    },
    id: "calendar",
  };
}
