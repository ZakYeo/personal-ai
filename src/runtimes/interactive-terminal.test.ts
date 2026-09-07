import { createInteractiveTerminalHarness } from "../test-support/interactive-terminal.js";

describe("interactive terminal cancellation owner", () => {
  it.each(["terminal interrupt", "EOF", "process shutdown"])(
    "settles a pending prompt on %s and removes listeners",
    async (event) => {
      const { input, questions, processSignals, terminal } =
        createInteractiveTerminalHarness();
      const prompt = terminal.question("Choose a microphone: ");
      if (event === "terminal interrupt") input.write("\u0003");
      else if (event === "EOF") input.end();
      else processSignals.emit("SIGTERM");
      await expect(prompt).rejects.toThrow();
      expect(terminal.signal.aborted).toBe(true);
      terminal.dispose();
      terminal.dispose();
      expect(processSignals.listenerCount("SIGINT")).toBe(0);
      expect(processSignals.listenerCount("SIGTERM")).toBe(0);
      expect(questions.listenerCount("SIGINT")).toBe(0);
      expect(questions.listenerCount("close")).toBe(0);
    },
  );
});
