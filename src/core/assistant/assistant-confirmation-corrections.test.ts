import { createAlarmFeature } from "../../features/alarms/alarm-feature.js";
import type {
  IntentInterpretation,
  IntentSessionContinuation,
} from "../../ports/intent.js";
import { createTestAlarmStore } from "../../test-support/alarm-store.js";
import {
  createAssistantConfig,
  createAssistantHarness,
  createCommand,
} from "../../test-support/core-assistant.js";

function harness(replies: IntentInterpretation[]) {
  let now = Date.parse("2026-09-07T12:00:00.000Z");
  const store = createTestAlarmStore();
  const continuations: IntentSessionContinuation[] = [];
  const starts: string[] = [];
  const initial: IntentInterpretation = {
    kind: "command",
    command: createCommand("alarm.create", {
      label: "tea",
      minutesFromNow: 10,
    }),
  };
  const queue = [initial, ...replies];
  const assistant = createAssistantHarness({
    clock: { now: () => new Date(now) },
    config: createAssistantConfig({ alarms: { enabled: true } }),
    features: [createAlarmFeature(store)],
    intentInterpreter: {
      start: (text) => {
        starts.push(text);
        return {
          next: (input) => {
            if (input) continuations.push(input);
            return Promise.resolve(
              queue.shift() ?? {
                kind: "unknown",
                response: { status: "unknown", text: "Please start again." },
              },
            );
          },
        };
      },
    },
  });
  return {
    assistant,
    store,
    starts,
    continuations,
    elapsed: (milliseconds: number) => {
      now = Date.parse("2026-09-07T12:00:00.000Z") + milliseconds;
    },
  };
}
const labelCorrection = (label: string): IntentInterpretation => ({
  kind: "command",
  command: createCommand("alarm.create", { label }),
});

describe("pending action corrections", () => {
  it("resolves a newly requested relative time against the live correction clock", async () => {
    const h = harness([
      {
        kind: "command",
        command: createCommand("alarm.create", {
          scheduledFor: null,
          minutesFromNow: 20,
        }),
      },
    ]);
    await h.assistant.handleText("set an alarm");
    h.elapsed(60_000);
    await h.assistant.handleText("make that twenty minutes from now");
    await h.assistant.handleText("yes");
    expect(await h.store.list()).toMatchObject([
      { scheduledFor: "2026-09-07T12:21:00.000Z" },
    ]);
  });
  it("keeps a bounded correction question in the originating workflow", async () => {
    const h = harness([
      {
        kind: "clarification",
        clarification: {
          capability: "alarm.create",
          origin: "intent_interpreter",
          parameter: "label",
          partialCommand: createCommand("alarm.create"),
          session: "resume",
        },
        response: { status: "ok", text: "What label should I use?" },
      },
      labelCorrection("coffee"),
    ]);
    await h.assistant.handleText("set an alarm");
    expect(await h.assistant.handleText("change its label")).toMatchObject({
      text: "What label should I use?",
      expectsFollowUp: true,
    });
    expect((await h.assistant.handleText("coffee")).status).toBe(
      "needs_confirmation",
    );
    expect(await h.store.list()).toEqual([]);
    await h.assistant.handleText("yes");
    expect(await h.store.list()).toMatchObject([
      { label: "coffee", scheduledFor: "2026-09-07T12:10:00.000Z" },
    ]);
    expect(h.starts).toHaveLength(1);
    expect(h.continuations[1]).toMatchObject({
      clarification: {
        parameter: "label",
        draft: { missingParameters: ["label"] },
      },
    });
  });
  it("cancels an incomplete correction without reinterpreting the cancellation", async () => {
    const h = harness([
      {
        kind: "rephrase",
        response: { status: "ok", text: "What label should I use?" },
      },
      labelCorrection("coffee"),
    ]);
    await h.assistant.handleText("set an alarm");
    await h.assistant.handleText("change its label");
    await h.assistant.handleText("no");
    expect(h.continuations).toHaveLength(1);
    expect(await h.store.list()).toEqual([]);
  });
  it("rejects an attempted read tool during correction", async () => {
    const h = harness([
      {
        kind: "tool_call",
        call: { id: "unwanted-read", command: createCommand("alarm.list") },
      },
    ]);
    await h.assistant.handleText("set an alarm");
    const outcome =
      await h.assistant.handleTextWithDiagnostics("change its label");
    expect(outcome.response.status).toBe("error");
    expect(outcome.diagnostics).not.toHaveLength(0);
    expect(await h.store.list()).toEqual([]);
    expect(h.continuations).toHaveLength(1);
  });
  it("changes only the label, requires fresh approval, and retains the exact prepared time", async () => {
    const h = harness([labelCorrection("coffee")]);
    await h.assistant.handleText("set the tea alarm in ten minutes");
    h.elapsed(60_000);
    const corrected = await h.assistant.handleText(
      "keep the time, change the label to coffee",
    );
    expect(corrected.status).toBe("needs_confirmation");
    expect(corrected.text).toContain("coffee");
    expect(await h.store.list()).toEqual([]);
    await h.assistant.handleText("yes");
    expect(await h.store.list()).toMatchObject([
      { label: "coffee", scheduledFor: "2026-09-07T12:10:00.000Z" },
    ]);
    expect(h.starts).toHaveLength(1);
    expect(h.continuations[0]).toMatchObject({
      clarification: {
        origin: "confirmation_correction",
        draft: {
          steps: [
            {
              capability: "alarm.create",
              parameters: {
                label: "tea",
                scheduledFor: "2026-09-07T12:10:00.000Z",
              },
            },
          ],
          remainingReplies: 2,
        },
      },
    });
  });
  it("permits three corrections followed by explicit approval", async () => {
    const h = harness([
      labelCorrection("one"),
      labelCorrection("two"),
      labelCorrection("three"),
    ]);
    await h.assistant.handleText("set an alarm");
    for (const label of ["one", "two", "three"]) {
      expect((await h.assistant.handleText(`call it ${label}`)).status).toBe(
        "needs_confirmation",
      );
    }
    await h.assistant.handleText("yes");
    expect(await h.store.list()).toMatchObject([{ label: "three" }]);
  });
  it("refuses a fourth correction without extending the provider budget", async () => {
    const h = harness([
      labelCorrection("one"),
      labelCorrection("two"),
      labelCorrection("three"),
      labelCorrection("four"),
    ]);
    await h.assistant.handleText("set an alarm");
    for (const label of ["one", "two", "three", "four"])
      await h.assistant.handleText(`call it ${label}`);
    expect(h.continuations).toHaveLength(3);
    expect(await h.store.list()).toEqual([]);
  });
  it("retains the original draft deadline across refreshed confirmations", async () => {
    const h = harness([
      labelCorrection("one"),
      labelCorrection("two"),
      labelCorrection("three"),
    ]);
    await h.assistant.handleText("set an alarm");
    for (const elapsed of [90_000, 180_000, 270_000]) {
      h.elapsed(elapsed);
      await h.assistant.handleText("change the label");
    }
    h.elapsed(300_000);
    expect((await h.assistant.handleText("yes")).text).toContain(
      "draft expired",
    );
    expect(await h.store.list()).toEqual([]);
  });
  it("discards the pending action and starts one fresh workflow for a changed topic", async () => {
    const h = harness([
      { kind: "replacement" },
      { kind: "command", command: createCommand("alarm.list") },
    ]);
    await h.assistant.handleText("set an alarm");
    expect(
      (await h.assistant.handleText("list my alarms instead")).status,
    ).toBe("ok");
    expect(h.starts).toEqual(["set an alarm", "list my alarms instead"]);
    expect(await h.store.list()).toEqual([]);
  });
});
