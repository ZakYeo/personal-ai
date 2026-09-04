import {
  createInitialAssistantPresentationSnapshot,
  reduceAssistantRuntimeEvent,
} from "./assistant-runtime-event.js";

describe("assistant runtime presentation events", () => {
  it("reduces a complete voice interaction into a frozen safe snapshot", () => {
    let snapshot = createInitialAssistantPresentationSnapshot({
      instanceId: "service-1",
      microphone: "available",
    });

    snapshot = reduceAssistantRuntimeEvent(snapshot, {
      interactionId: "interaction-1",
      occurredAt: "2026-09-04T09:00:00.000Z",
      sequence: 1,
      type: "wake_detected",
    });
    snapshot = reduceAssistantRuntimeEvent(snapshot, {
      delta: "list my alarms",
      interactionId: "interaction-1",
      occurredAt: "2026-09-04T09:00:01.000Z",
      sequence: 2,
      type: "transcript_delta",
    });
    snapshot = reduceAssistantRuntimeEvent(snapshot, {
      interactionId: "interaction-1",
      occurredAt: "2026-09-04T09:00:02.000Z",
      sequence: 3,
      text: "list my alarms",
      type: "transcript_final",
    });
    snapshot = reduceAssistantRuntimeEvent(snapshot, {
      interactionId: "interaction-1",
      occurredAt: "2026-09-04T09:00:03.000Z",
      sequence: 4,
      type: "processing",
    });
    snapshot = reduceAssistantRuntimeEvent(snapshot, {
      citations: [{ title: "Alarm guide", url: "https://example.com/alarms" }],
      interactionId: "interaction-1",
      occurredAt: "2026-09-04T09:00:04.000Z",
      sequence: 5,
      status: "ok",
      text: "You have no alarms set.",
      type: "response_ready",
    });
    snapshot = reduceAssistantRuntimeEvent(snapshot, {
      interactionId: "interaction-1",
      occurredAt: "2026-09-04T09:00:05.000Z",
      sequence: 6,
      type: "completed",
    });

    expect(snapshot).toMatchObject({
      instanceId: "service-1",
      interaction: {
        id: "interaction-1",
        phase: "completed",
        response: {
          citations: [
            { title: "Alarm guide", url: "https://example.com/alarms" },
          ],
          status: "ok",
          text: "You have no alarms set.",
        },
        transcript: "list my alarms",
      },
      sequence: 6,
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.interaction)).toBe(true);
    expect(Object.isFrozen(snapshot.interaction?.response?.citations)).toBe(
      true,
    );
  });

  it("rejects out-of-order events and illegal interaction transitions", () => {
    const snapshot = createInitialAssistantPresentationSnapshot({
      instanceId: "service-1",
      microphone: "available",
    });

    expect(() =>
      reduceAssistantRuntimeEvent(snapshot, {
        interactionId: "interaction-1",
        occurredAt: "2026-09-04T09:00:00.000Z",
        sequence: 2,
        type: "processing",
      }),
    ).toThrow("expected sequence 1");

    expect(() =>
      reduceAssistantRuntimeEvent(snapshot, {
        interactionId: "interaction-1",
        occurredAt: "2026-09-04T09:00:00.000Z",
        sequence: 1,
        type: "completed",
      }),
    ).toThrow("cannot transition from idle to completed");
  });

  it("bounds event text and validates hidden link metadata", () => {
    const snapshot = createInitialAssistantPresentationSnapshot({
      instanceId: "service-1",
      microphone: "available",
    });
    const listening = reduceAssistantRuntimeEvent(snapshot, {
      interactionId: "interaction-1",
      occurredAt: "2026-09-04T09:00:00.000Z",
      sequence: 1,
      type: "wake_detected",
    });
    const processing = reduceAssistantRuntimeEvent(listening, {
      interactionId: "interaction-1",
      occurredAt: "2026-09-04T09:00:01.000Z",
      sequence: 2,
      type: "processing",
    });

    expect(() =>
      reduceAssistantRuntimeEvent(processing, {
        interactionId: "interaction-1",
        occurredAt: "2026-09-04T09:00:02.000Z",
        sequence: 3,
        status: "ok",
        text: "x".repeat(4_001),
        type: "response_ready",
      }),
    ).toThrow("response text exceeded");

    expect(() =>
      reduceAssistantRuntimeEvent(processing, {
        citations: [{ title: "Unsafe", url: "file:///etc/passwd" }],
        interactionId: "interaction-1",
        occurredAt: "2026-09-04T09:00:02.000Z",
        sequence: 3,
        status: "ok",
        text: "Done.",
        type: "response_ready",
      }),
    ).toThrow("citation URL");
  });

  it("keeps confirmation active until the exact interaction completes", () => {
    const initial = createInitialAssistantPresentationSnapshot({
      instanceId: "service-1",
      microphone: "available",
    });
    const listening = reduceAssistantRuntimeEvent(initial, {
      interactionId: "interaction-1",
      occurredAt: "2026-09-04T09:00:00.000Z",
      sequence: 1,
      type: "wake_detected",
    });
    const processing = reduceAssistantRuntimeEvent(listening, {
      interactionId: "interaction-1",
      occurredAt: "2026-09-04T09:00:01.000Z",
      sequence: 2,
      type: "processing",
    });
    const confirmation = reduceAssistantRuntimeEvent(processing, {
      interactionId: "interaction-1",
      occurredAt: "2026-09-04T09:00:02.000Z",
      prompt: "Set an alarm for 9am?",
      sequence: 3,
      type: "confirmation_required",
    });

    expect(confirmation.interaction).toMatchObject({
      confirmation: { prompt: "Set an alarm for 9am?" },
      phase: "confirmation",
    });
    expect(() =>
      reduceAssistantRuntimeEvent(confirmation, {
        interactionId: "interaction-2",
        occurredAt: "2026-09-04T09:00:03.000Z",
        sequence: 4,
        type: "processing",
      }),
    ).toThrow("active interaction interaction-1");
  });
});
