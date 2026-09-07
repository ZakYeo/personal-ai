import { createVoiceActivationDependencies } from "../../test-support/voice-runtime.js";
import { createVoiceOutputCoordinator } from "./voice-output-coordinator.js";
import { runVoiceActivation } from "./voice-activation.js";

describe("wake-qualified spoken stop", () => {
  it.each(["stop", "Stop please", "Hey Jarvis, stop!"])(
    "interrupts admitted output for %s without intent interpretation",
    async (commandUtterance) => {
      const outputCoordinator = createVoiceOutputCoordinator();
      let now = 0;
      let started = false;
      const playing = outputCoordinator.run(
        (signal) =>
          new Promise<void>((resolve) => {
            started = true;
            signal.addEventListener(
              "abort",
              () => {
                now += 17;
                resolve();
              },
              { once: true },
            );
          }),
      );
      const queued = vi.fn(() => Promise.resolve());
      const queuedResult = outputCoordinator.run(queued);
      const observed = Promise.allSettled([playing, queuedResult]);
      await vi.waitUntil(() => started);
      const handledTexts: string[] = [];
      const output: string[] = [];
      try {
        let completed = false;
        const activation = runVoiceActivation({
          ...createVoiceActivationDependencies({
            commandUtterance,
            handledTexts,
            output,
            wakeUtterance: "Hey Jarvis",
          }),
          outputCoordinator,
          timing: { nowMs: () => now },
        }).then((result) => {
          completed = true;
          return result;
        });
        await vi.waitUntil(() => completed || handledTexts.length > 0);
        expect(handledTexts).toEqual([]);
        const result = await activation;
        expect(result).toMatchObject({
          status: "cancelled",
          textOutputWritten: false,
        });
        expect(result.timings?.events).toEqual(
          expect.arrayContaining([
            { name: "stop_recognized", offsetMs: 0 },
            { name: "output_stopped", offsetMs: 17 },
          ]),
        );
        expect(handledTexts).toEqual([]);
        expect(output).toEqual([]);
        expect(queued).not.toHaveBeenCalled();
        expect((await observed).map((item) => item.status)).toEqual([
          "rejected",
          "rejected",
        ]);
      } finally {
        await outputCoordinator.interrupt();
      }
    },
  );

  it("does not treat a longer action request as a voice stop", async () => {
    const handledTexts: string[] = [];
    await runVoiceActivation(
      createVoiceActivationDependencies({
        commandUtterance: "stop the tea alarm",
        handledTexts,
        wakeUtterance: "Hey Jarvis",
      }),
    );
    expect(handledTexts).toEqual(["stop the tea alarm"]);
  });
});
