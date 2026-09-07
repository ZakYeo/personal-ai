import type { Assistant } from "../../core/assistant/index.js";
import { createAssistantRuntimeEventStream } from "./assistant-runtime-event-stream.js";
import { createPresentationControlHandler } from "./presentation-control-handler.js";
import { createPresentationInteractionCoordinator } from "./presentation-interaction-coordinator.js";

describe("presentation control handler", () => {
  it("rejects an old click after voice revises the confirmation", async () => {
    const handled: string[] = [];
    const eventStream = createStream();
    const presentation = createCoordinator(eventStream);
    const voice = presentation.beginVoiceInteraction();
    voice.processing();
    voice.confirmation("Approve tea?");
    const oldSequence =
      eventStream.snapshot().interaction!.confirmation!.sequence;
    expect(voice.claimContinuation()).toBe(true);
    voice.processing();
    voice.confirmation("Approve coffee?");
    const handle = createPresentationControlHandler({
      assistant: createAssistant(handled),
      eventStream,
      presentation,
    });
    await expect(
      handle({
        type: "confirm",
        requestId: "old-voice-click",
        interactionId: "interaction-1",
        confirmationSequence: oldSequence,
      }),
    ).resolves.toMatchObject({ status: "rejected" });
    expect(voice.continuationAvailable()).toBe(true);
    expect(handled).toEqual([]);
  });

  it("rejects a queued approval of older facts after a correction keeps the interaction ID", async () => {
    const handled: string[] = [];
    const eventStream = createStream();
    const presentation = createCoordinator(eventStream);
    const original = presentation.beginInteraction();
    original.processing();
    original.confirmation("Set the tea alarm?");
    const confirmationSequence = eventStream.snapshot().sequence;
    const assistant = createAssistant(handled);
    assistant.handleTextWithDiagnostics = (text) => {
      handled.push(text);
      return Promise.resolve({
        response: {
          status: "needs_confirmation",
          text: "Set the coffee alarm?",
        },
      });
    };
    const handle = createPresentationControlHandler({
      assistant,
      eventStream,
      presentation,
    });
    await handle({
      type: "submit_text",
      requestId: "correction",
      text: "change the label to coffee",
    });
    await expect(
      handle({
        type: "confirm",
        interactionId: "interaction-1",
        confirmationSequence,
        requestId: "old-click",
      }),
    ).resolves.toMatchObject({ status: "rejected" });
    expect(handled).toEqual(["change the label to coffee"]);
    await expect(
      handle({
        type: "confirm",
        interactionId: "interaction-1",
        confirmationSequence: eventStream.snapshot().sequence,
        requestId: "fresh-click",
      }),
    ).resolves.toMatchObject({ status: "accepted" });
    expect(handled).toEqual(["change the label to coffee", "yes"]);
  });

  it.each(["confirm", "submit_text"] as const)(
    "joins voice capture before executing a %s reply",
    async (type) => {
      const handled: string[] = [];
      const eventStream = createStream();
      const presentation = createCoordinator(eventStream);
      const pending = presentation.beginInteraction();
      pending.processing();
      pending.confirmation("Approve?");
      let finish = () => {};
      const interruptTurn = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      );
      const handle = createPresentationControlHandler({
        assistant: createAssistant(handled),
        eventStream,
        presentation,
        interruptTurn,
      });
      const result = handle(
        type === "confirm"
          ? {
              type,
              requestId: "reply",
              interactionId: "interaction-1",
              confirmationSequence:
                eventStream.snapshot().interaction!.confirmation!.sequence,
            }
          : { type, requestId: "reply", text: "yes" },
      );
      await Promise.resolve();
      expect(interruptTurn).toHaveBeenCalledOnce();
      expect(pending.continuationAvailable()).toBe(false);
      expect(handled).toEqual([]);
      finish();
      await result;
      expect(handled).toEqual(["yes"]);
    },
  );
  it("does not mark the microphone as capturing when a typed reply claims a prompt", async () => {
    const eventStream = createStream();
    const presentation = createCoordinator(eventStream);
    const pending = presentation.beginInteraction();
    pending.processing();
    pending.confirmation("Approve?");
    const microphones: string[] = [];
    eventStream.subscribe(() => {
      microphones.push(eventStream.snapshot().microphone);
    });
    const handle = createPresentationControlHandler({
      assistant: createAssistant([]),
      eventStream,
      presentation,
    });
    await handle({ type: "submit_text", requestId: "typed", text: "yes" });
    expect(microphones).not.toContain("capturing");
  });

  it("awaits voice interruption without interpreting a command or discarding confirmation", async () => {
    const handled: string[] = [];
    const eventStream = createStream();
    const presentation = createCoordinator(eventStream);
    const interaction = presentation.beginInteraction();
    interaction.processing();
    interaction.confirmation("Approve the exact action?");
    let finish = () => {};
    const interruptVoice = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const handle = createPresentationControlHandler({
      assistant: createAssistant(handled),
      eventStream,
      presentation,
      interruptVoice,
    });
    let settled = false;
    const result = handle({ requestId: "stop", type: "stop_listening" }).then(
      (value) => {
        settled = true;
        return value;
      },
    );
    await Promise.resolve();
    expect(interruptVoice).toHaveBeenCalledOnce();
    expect(settled).toBe(false);
    finish();
    await expect(result).resolves.toEqual({ status: "accepted" });
    expect(handled).toEqual([]);
    expect(eventStream.snapshot().interaction?.phase).toBe("confirmation");
  });

  it.each(["yes", "no", "change the label"])(
    "admits typed continuation %s and invalidates voice capture",
    async (text) => {
      const handled: string[] = [];
      const eventStream = createStream();
      const coordinator = createCoordinator(eventStream);
      const voice = coordinator.beginInteraction();
      voice.processing();
      voice.confirmation("Approve?");
      voice.followUpListening();
      const handle = createPresentationControlHandler({
        assistant: createAssistant(handled),
        eventStream,
        presentation: coordinator,
      });
      await expect(
        handle({ requestId: "typed", text, type: "submit_text" }),
      ).resolves.toEqual({ status: "accepted" });
      expect(handled).toEqual([text]);
      expect(voice.claimContinuation()).toBe(false);
      expect(eventStream.snapshot().interaction).toMatchObject({
        id: "interaction-1",
        phase: "completed",
        transcript: text,
      });
    },
  );

  it("keeps typed clarification available and rejects conflicting profile updates", async () => {
    const eventStream = createStream();
    const coordinator = createCoordinator(eventStream);
    const assistant = createAssistant([]);
    assistant.handleTextWithDiagnostics = () =>
      Promise.resolve({
        response: { status: "ok", text: "Which label?", expectsFollowUp: true },
      });
    const profileControl = vi.fn();
    const handle = createPresentationControlHandler({
      assistant,
      eventStream,
      presentation: coordinator,
      profileControl,
    });
    await handle({ requestId: "ask", text: "edit it", type: "submit_text" });
    expect(eventStream.snapshot().interaction?.phase).toBe("response");
    await expect(
      handle({
        requestId: "profile",
        reference: "profile-1",
        field: "preferredName",
        value: "Zak",
        type: "profile_set",
      }),
    ).resolves.toMatchObject({ status: "rejected" });
    expect(profileControl).not.toHaveBeenCalled();
    await expect(
      handle({ requestId: "answer", text: "Tea", type: "submit_text" }),
    ).resolves.toEqual({ status: "accepted" });
  });
  it("resumes the exact validated pending confirmation", async () => {
    const handled: string[] = [];
    const assistant = createAssistant(handled);
    const eventStream = createStream();
    const coordinator = createCoordinator(eventStream);
    const interaction = coordinator.beginInteraction();
    interaction.processing();
    interaction.confirmation("Send the exact message?");
    const interactionId = eventStream.snapshot().interaction?.id;
    const handle = createPresentationControlHandler({
      assistant,
      eventStream,
      presentation: coordinator,
    });

    const result = await handle({
      interactionId: interactionId ?? "missing",
      confirmationSequence:
        eventStream.snapshot().interaction!.confirmation!.sequence,
      requestId: "request-1",
      type: "confirm",
    });

    expect(result).toEqual({ status: "accepted" });
    expect(handled).toEqual(["yes"]);
    expect(eventStream.snapshot().interaction).toMatchObject({
      id: interactionId,
      phase: "completed",
      response: { text: "Handled yes" },
    });
  });

  it("rejects stale confirmation identifiers without calling the assistant", async () => {
    const handled: string[] = [];
    const eventStream = createStream();
    const coordinator = createCoordinator(eventStream);
    const interaction = coordinator.beginInteraction();
    interaction.processing();
    interaction.confirmation("Approve?");
    const handle = createPresentationControlHandler({
      assistant: createAssistant(handled),
      eventStream,
      presentation: coordinator,
    });

    const result = await handle({
      interactionId: "stale-interaction",
      confirmationSequence:
        eventStream.snapshot().interaction!.confirmation!.sequence,
      requestId: "request-2",
      type: "decline",
    });

    expect(result).toEqual({
      message: "That confirmation is no longer pending.",
      status: "rejected",
    });
    expect(handled).toEqual([]);
  });

  it("runs bounded typed requests and rejects unavailable interruption", async () => {
    const handled: string[] = [];
    const eventStream = createStream();
    const handle = createPresentationControlHandler({
      assistant: createAssistant(handled),
      eventStream,
      presentation: createCoordinator(eventStream),
    });

    await expect(
      handle({ requestId: "request-3", text: "Hello", type: "submit_text" }),
    ).resolves.toEqual({ status: "accepted" });
    await expect(
      handle({ requestId: "request-4", type: "stop_listening" }),
    ).resolves.toEqual({
      message: "Voice interruption is unavailable in this service.",
      status: "rejected",
    });
    expect(handled).toEqual(["Hello"]);
  });

  it("logs profile failures and presents a human-safe terminal response", async () => {
    const eventStream = createStream();
    const stderr = { write: vi.fn() };
    const handle = createPresentationControlHandler({
      assistant: createAssistant([]),
      eventStream,
      io: { stderr },
      presentation: createCoordinator(eventStream),
      profileControl: () =>
        Promise.reject(new Error("private persistence failure")),
    });

    await expect(
      handle({
        field: "preferredName",
        requestId: "request-5",
        type: "profile_explain",
      }),
    ).resolves.toEqual({ status: "accepted" });
    expect(eventStream.snapshot().interaction).toMatchObject({
      phase: "completed",
      response: {
        status: "error",
        text: "I hit a problem and could not complete that.",
      },
    });
    expect(stderr.write).toHaveBeenCalledWith(
      "Runtime failure: private persistence failure\n",
    );
  });
});

function createStream() {
  return createAssistantRuntimeEventStream({
    instanceId: "service-1",
    now: () => new Date("2026-09-04T10:00:00.000Z"),
  });
}

function createCoordinator(eventStream: ReturnType<typeof createStream>) {
  return createPresentationInteractionCoordinator({
    createInteractionId: () => "interaction-1",
    publish: (event) => eventStream.publish(event),
  });
}

function createAssistant(handled: string[]): Assistant {
  return {
    handleText: (text) => {
      handled.push(text);
      return Promise.resolve({ status: "ok", text: `Handled ${text}` });
    },
    handleTextWithDiagnostics: (text) => {
      handled.push(text);
      return Promise.resolve({
        response: { status: "ok", text: `Handled ${text}` },
      });
    },
  };
}
