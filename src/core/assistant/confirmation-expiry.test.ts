import {
  createAssistantWithFeatures,
  createCommand,
  createFeature,
  createInterpreter,
  requireConfirmationFor,
} from "../../test-support/core-assistant.js";

const startTime = Date.parse("2026-09-07T10:00:00Z");

describe("confirmation expiry", () => {
  it("executes just before the two-minute deadline", async () => {
    const harness = createHarness();
    await harness.assistant.handleText("do it");
    harness.advance(119_999);
    await expect(harness.assistant.handleText("yes")).resolves.toMatchObject({
      text: "Executed.",
    });
    expect(harness.execute).toHaveBeenCalledOnce();
  });

  it.each([120_000, 120_001, -1])(
    "expires the original confirmation at %s milliseconds",
    async (elapsed) => {
      const harness = createHarness();
      expect(await harness.assistant.handleText("do it")).toMatchObject({
        status: "needs_confirmation",
      });
      harness.advance(elapsed);
      await expect(harness.assistant.handleText("yes")).resolves.toEqual(
        expiredResponse,
      );
      expect(harness.execute).not.toHaveBeenCalled();
    },
  );

  it("does not extend the deadline when another input repeats the prompt", async () => {
    const harness = createHarness();
    await harness.assistant.handleText("do it");
    harness.advance(110_000);
    expect(await harness.assistant.handleText("maybe")).toMatchObject({
      status: "needs_confirmation",
    });
    harness.advance(120_000);
    await expect(harness.assistant.handleText("yes")).resolves.toEqual(
      expiredResponse,
    );
    expect(harness.execute).not.toHaveBeenCalled();
  });

  it("does not reinterpret repeated stale approval and permits an explicit new request", async () => {
    const harness = createHarness();
    await harness.assistant.handleText("do it");
    harness.advance(120_000);
    await expect(
      Promise.all([
        harness.assistant.handleText("yes"),
        harness.assistant.handleText("yes"),
      ]),
    ).resolves.toEqual([expiredResponse, expiredResponse]);
    expect(harness.interpret).toHaveBeenCalledOnce();
    expect(harness.execute).not.toHaveBeenCalled();
    await expect(
      harness.assistant.handleText("prepare it again"),
    ).resolves.toMatchObject({ status: "needs_confirmation" });
    await expect(harness.assistant.handleText("yes")).resolves.toMatchObject({
      text: "Executed.",
    });
    expect(harness.execute).toHaveBeenCalledOnce();
  });
});

const expiredResponse = {
  status: "ok",
  text: "That confirmation expired. Please ask me to prepare the action again.",
};

function createHarness() {
  let time = startTime;
  const execute = vi.fn(() => Promise.resolve({ text: "Executed." }));
  const interpreter = createInterpreter(createCommand("test.echo"));
  const interpret = vi.fn(interpreter.start.bind(interpreter));
  const assistant = createAssistantWithFeatures({
    clock: { now: () => new Date(time) },
    config: requireConfirmationFor("test", ["test.echo"]),
    features: [
      createFeature({
        execute,
        confirmation: () => ({ facts: {}, text: "run the echo command" }),
      }),
    ],
    intentInterpreter: { start: interpret },
  });
  return {
    assistant,
    execute,
    interpret,
    advance: (elapsed: number) => {
      time = startTime + elapsed;
    },
  };
}
