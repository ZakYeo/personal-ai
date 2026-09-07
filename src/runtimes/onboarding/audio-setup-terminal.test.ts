import { createInteractiveTerminalHarness } from "../../test-support/interactive-terminal.js";
import type { AudioSetupPort } from "../../ports/audio-setup.js";
import { runAudioSetupSession } from "./audio-setup-session.js";

describe("microphone setup terminal interruption", () => {
  it.each(["selection", "capture", "playback prompt"])(
    "settles Ctrl-C at %s and discards test audio",
    async (phase) => {
      const harness = createInteractiveTerminalHarness();
      const signals: AbortSignal[] = [];
      const close = vi.fn().mockResolvedValue({ done: true, value: undefined });
      const play = vi.fn();
      let reads = 0;
      const audio: AudioSetupPort = {
        listInputs: () => Promise.resolve([{ id: "mic", label: "Microphone" }]),
        capture: (_device, signal) => {
          signals.push(signal);
          return {
            [Symbol.asyncIterator]: () => ({
              next: () => {
                reads += 1;
                if (reads === 1)
                  return Promise.resolve({
                    done: false,
                    value: new Uint8Array([0, 64]),
                  });
                return phase === "capture"
                  ? new Promise<IteratorResult<Uint8Array>>(() => {})
                  : Promise.resolve({ done: true, value: undefined });
              },
              return: close,
            }),
          };
        },
        play,
      };
      const result = runAudioSetupSession({
        audio,
        question: harness.terminal.question,
        signal: harness.terminal.signal,
        writeLine: harness.writeLine,
        reportFailure: vi.fn(),
      });
      await vi.waitUntil(() =>
        harness.readOutput().includes("Microphone number"),
      );
      if (phase !== "selection") {
        harness.input.write("1\n");
        await vi.waitUntil(() =>
          harness.readOutput().includes("Record a five-second"),
        );
        harness.input.write("yes\n");
        await vi.waitUntil(() => reads >= 2);
      }
      if (phase === "playback prompt")
        await vi.waitUntil(() =>
          harness.readOutput().includes("Play the test"),
        );
      harness.input.write("\u0003");
      expect(await result).toBe(1);
      expect(harness.terminal.signal.aborted).toBe(true);
      expect(signals).toEqual(
        phase === "selection" ? [] : [harness.terminal.signal],
      );
      expect(play).not.toHaveBeenCalled();
      expect(harness.readOutput()).toContain("Test audio discarded.");
      harness.terminal.dispose();
      expect(harness.processSignals.eventNames()).toEqual([]);
    },
  );
});
