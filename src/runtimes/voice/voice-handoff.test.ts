import { createVoiceActivationDependencies } from "../../test-support/voice-runtime.js";
import { runVoiceActivation } from "./voice-activation.js";

describe("voice replacement handoff", () => {
  it("uses the exact captured replacement without acquiring the microphone again", async () => {
    const handledTexts: string[] = [];
    const capture = vi.fn(() =>
      Promise.reject(new Error("Unexpected microphone acquisition.")),
    );
    const result = await runVoiceActivation({
      ...createVoiceActivationDependencies({ handledTexts }),
      initialCommand: { text: "List my alarms", wakePhrase: "hey jarvis" },
      commandAudioInput: { capture },
      wakeAudioInput: { capture },
    });
    expect(result.status).toBe("spoken");
    expect(handledTexts).toEqual(["List my alarms"]);
    expect(capture).not.toHaveBeenCalled();
  });
});
