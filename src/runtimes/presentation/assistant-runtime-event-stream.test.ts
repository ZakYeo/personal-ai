import { createAssistantRuntimeEventStream } from "./assistant-runtime-event-stream.js";

describe("assistant runtime event stream", () => {
  it("assigns ordered metadata, publishes frozen events, and updates its snapshot", () => {
    const received: unknown[] = [];
    const stream = createAssistantRuntimeEventStream({
      instanceId: "service-1",
      now: () => new Date("2026-09-04T10:00:00.000Z"),
    });
    stream.subscribe((event) => received.push(event));

    const event = stream.publish({
      interactionId: "interaction-1",
      type: "wake_detected",
    });

    expect(event).toEqual({
      interactionId: "interaction-1",
      occurredAt: "2026-09-04T10:00:00.000Z",
      sequence: 1,
      type: "wake_detected",
    });
    expect(Object.isFrozen(event)).toBe(true);
    expect(received).toEqual([event]);
    expect(stream.snapshot()).toMatchObject({
      interaction: { id: "interaction-1", phase: "listening" },
      sequence: 1,
    });
  });

  it("replays retained events and falls back to a snapshot after a gap or restart", () => {
    const stream = createAssistantRuntimeEventStream({
      instanceId: "service-1",
      now: () => new Date("2026-09-04T10:00:00.000Z"),
      replayLimit: 2,
    });
    stream.publish({ type: "wake_listening" });
    stream.publish({
      interactionId: "interaction-1",
      type: "wake_detected",
    });
    stream.publish({
      interactionId: "interaction-1",
      type: "processing",
    });

    expect(
      stream.readSince({ instanceId: "service-1", sequence: 2 }),
    ).toMatchObject({ kind: "events", events: [{ sequence: 3 }] });
    expect(
      stream.readSince({ instanceId: "service-1", sequence: 0 }),
    ).toMatchObject({ kind: "snapshot", snapshot: { sequence: 3 } });
    expect(
      stream.readSince({ instanceId: "old-service", sequence: 2 }),
    ).toMatchObject({
      kind: "snapshot",
      snapshot: { instanceId: "service-1" },
    });
  });

  it("unsubscribes listeners and validates replay limits", () => {
    expect(() =>
      createAssistantRuntimeEventStream({
        instanceId: "service-1",
        now: () => new Date("2026-09-04T10:00:00.000Z"),
        replayLimit: 0,
      }),
    ).toThrow("positive integer");

    const listener = vi.fn();
    const stream = createAssistantRuntimeEventStream({
      instanceId: "service-1",
      now: () => new Date("2026-09-04T10:00:00.000Z"),
    });
    const unsubscribe = stream.subscribe(listener);
    unsubscribe();
    stream.publish({ type: "wake_listening" });

    expect(listener).not.toHaveBeenCalled();
  });
});
