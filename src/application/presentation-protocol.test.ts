import {
  parsePresentationAuthentication,
  parsePresentationControl,
  parsePresentationServerMessage,
} from "./presentation-protocol.js";

describe("presentation protocol", () => {
  it("parses bounded exact command-center projections", () => {
    expect(
      parsePresentationServerMessage({
        projection: {
          activity: [],
          alarms: [],
          integrations: [{ label: "Calendar", status: "ready" }],
          interactions: [],
          profile: [],
          sources: [{ title: "Forecast", url: "https://example.com/weather" }],
          tasks: [{ id: "task-1", label: "Review", status: "open" }],
          today: ["Review"],
        },
        protocolVersion: 1,
        type: "projection",
      }),
    ).toMatchObject({
      projection: { tasks: [{ id: "task-1" }] },
      type: "projection",
    });
    expect(
      parsePresentationServerMessage({
        projection: {
          activity: [],
          alarms: [],
          diagnostics: "private",
          integrations: [],
          interactions: [],
          profile: [],
          sources: [],
          tasks: [],
          today: [],
        },
        protocolVersion: 1,
        type: "projection",
      }),
    ).toBeUndefined();
  });
  it("parses exact authentication and control messages", () => {
    expect(
      parsePresentationAuthentication({
        protocolVersion: 1,
        token: "secret",
        type: "authenticate",
      }),
    ).toEqual({ token: "secret" });
    expect(
      parsePresentationControl({
        protocolVersion: 1,
        requestId: "request-1",
        text: "list my alarms",
        type: "submit_text",
      }),
    ).toEqual({
      requestId: "request-1",
      text: "list my alarms",
      type: "submit_text",
    });
    expect(
      parsePresentationControl({
        field: "preferredName",
        protocolVersion: 1,
        requestId: "request-2",
        type: "profile_set",
        value: "Zachary",
      }),
    ).toEqual({
      field: "preferredName",
      requestId: "request-2",
      type: "profile_set",
      value: "Zachary",
    });
  });

  it("rejects extra protocol fields", () => {
    expect(
      parsePresentationAuthentication({
        leaked: "diagnostic",
        protocolVersion: 1,
        token: "secret",
        type: "authenticate",
      }),
    ).toBeUndefined();
    expect(
      parsePresentationControl({
        protocolVersion: 1,
        requestId: "request-1",
        text: "list my alarms",
        type: "submit_text",
        unsafe: true,
      }),
    ).toBeUndefined();
    expect(
      parsePresentationControl({
        field: "preferredName",
        privateTarget: "/home/user/profile.json",
        protocolVersion: 1,
        requestId: "request-2",
        type: "profile_forget",
      }),
    ).toBeUndefined();
  });

  it("validates snapshots from unknown field by field", () => {
    expect(
      parsePresentationServerMessage({
        protocolVersion: 1,
        snapshot: {
          instanceId: "service-1",
          microphone: "available",
          sequence: 0,
          wakeListening: true,
        },
        type: "snapshot",
      }),
    ).toEqual({
      protocolVersion: 1,
      snapshot: {
        instanceId: "service-1",
        microphone: "available",
        sequence: 0,
        wakeListening: true,
      },
      type: "snapshot",
    });
    expect(
      parsePresentationServerMessage({
        protocolVersion: 1,
        snapshot: {
          diagnostics: ["private"],
          instanceId: "service-1",
          microphone: "available",
          sequence: 0,
          wakeListening: true,
        },
        type: "snapshot",
      }),
    ).toBeUndefined();
  });
});
