import { createFixedClock } from "../../test-support/core-assistant.js";
import { createInteractionSession } from "./interaction-session.js";

describe("interaction session clarification", () => {
  it.each(["no", "no thanks", "cancel", "stop"])(
    "discards a pending clarification for %j",
    async (reply) => {
      const session = createInteractionSession(createFixedClock());
      const resume = vi.fn(() =>
        Promise.resolve({
          kind: "completed" as const,
          outcome: completedOutcome,
        }),
      );
      await session.run(
        "initial",
        () =>
          Promise.resolve(
            session.requestClarification(clarificationOutcome, resume),
          ),
        unexpectedExecution,
        vi.fn(),
      );

      await expect(
        session.run(reply, unexpectedHandling, unexpectedExecution, vi.fn()),
      ).resolves.toEqual({
        response: { status: "ok", text: "Okay, I did not do that." },
      });
      expect(resume).not.toHaveBeenCalled();
    },
  );

  it("resumes the exact clarification callback for other input", async () => {
    const session = createInteractionSession(createFixedClock());
    const resume = vi.fn(() =>
      Promise.resolve({
        kind: "completed" as const,
        outcome: completedOutcome,
      }),
    );
    await session.run(
      "initial",
      () =>
        Promise.resolve(
          session.requestClarification(clarificationOutcome, resume),
        ),
      unexpectedExecution,
      vi.fn(),
    );

    await expect(
      session.run("10am", unexpectedHandling, unexpectedExecution, vi.fn()),
    ).resolves.toEqual(completedOutcome);
    expect(resume).toHaveBeenCalledWith("10am", undefined);
  });
});

const clarificationOutcome = {
  response: {
    expectsFollowUp: true,
    status: "ok" as const,
    text: "What time should I use?",
  },
};
const completedOutcome = {
  response: { status: "ok" as const, text: "Completed." },
};
const unexpectedHandling = () =>
  Promise.reject(new Error("Unexpected new interaction."));
const unexpectedExecution = () =>
  Promise.reject(new Error("Unexpected confirmation execution."));

describe("serialized confirmation expiry", () => {
  it("checks expiry after a queued approval acquires the interaction transaction", async () => {
    let time = 0;
    const session = createInteractionSession({ now: () => new Date(time) });
    const prompt = {
      response: { status: "needs_confirmation" as const, text: "Approve?" },
    };
    session.requestConfirmation(
      {
        kind: "single",
        originalText: "request",
        steps: [],
        validatedAt: new Date(0).toISOString(),
      },
      prompt,
    );
    let finish = () => {};
    let completing = false;
    const first = session.run(
      "maybe",
      unexpectedHandling,
      unexpectedExecution,
      () => {
        completing = true;
        return new Promise<typeof prompt>((resolve) => {
          finish = () => resolve(prompt);
        });
      },
    );
    await vi.waitUntil(() => completing);
    time = 119_999;
    const execute = vi.fn(unexpectedExecution);
    const queued = session.run("yes", unexpectedHandling, execute, () => {});
    time = 120_000;
    finish();
    await first;
    await expect(queued).resolves.toMatchObject({
      response: {
        text: "That confirmation expired. Please ask me to prepare the action again.",
      },
    });
    expect(execute).not.toHaveBeenCalled();
  });
});
