import { createInteractionSession } from "./interaction-session.js";

describe("interaction session clarification", () => {
  it.each(["no", "no thanks", "cancel", "stop"])(
    "discards a pending clarification for %j",
    async (reply) => {
      const session = createInteractionSession();
      const resume = vi.fn(() => Promise.resolve(completedOutcome));
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
    const session = createInteractionSession();
    const resume = vi.fn(() => Promise.resolve(completedOutcome));
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
    expect(resume).toHaveBeenCalledWith("10am");
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
