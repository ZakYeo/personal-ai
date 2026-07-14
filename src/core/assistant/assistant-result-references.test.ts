import { createAssistant } from "./assistant.js";
import { createCapabilityRoutingIndex } from "../../ports/capability-catalog.js";
import type { AssistantContext } from "../../ports/assistant.js";
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
        facts: { date: "2026-07-17", title: "Dentist" },
        kind: "calendar_event",
        ordinal: 1,
        reference: "calendar-event-1",
      },
    ]);
    expect(JSON.stringify(contexts[1])).not.toContain("provider-secret-id");

    await assistant.handleText("turn two");
    await assistant.handleText("turn three");
    await assistant.handleText("expired");
    expect(contexts[4]?.resultReferences).toEqual([]);
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

    expect(secondContexts[0]?.resultReferences).toEqual([]);
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

    expect(contexts[2]?.resultReferences).toEqual([]);
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
              facts: { date: "2026-07-17", title: "Dentist" },
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
