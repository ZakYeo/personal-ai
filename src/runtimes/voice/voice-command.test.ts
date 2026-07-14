import { deterministicScenarios } from "../../test-support/deterministic-scenarios.js";
import { createVoiceRuntimeDependencies } from "../../test-support/voice-runtime.js";
import { runDetectedVoiceCommand } from "./voice-command.js";

describe("runDetectedVoiceCommand", () => {
  it("uses cohesive streaming output through its public dependency type", async () => {
    const streamedAudio: string[] = [];
    const batchSpeech = vi.fn();
    const dependencies = createVoiceRuntimeDependencies();

    await expect(
      runDetectedVoiceCommand(
        {
          ...dependencies,
          streamingOutput: {
            audioOutput: {
              playStream: async (chunks) => {
                for await (const chunk of chunks) {
                  streamedAudio.push(Buffer.from(chunk).toString("utf8"));
                }
              },
            },
            textToSpeech: {
              synthesizeStream: (text) =>
                Promise.resolve({
                  chunks: (async function* () {
                    await Promise.resolve();
                    yield Buffer.from(`stream:${text}`, "utf8");
                  })(),
                  text,
                }),
            },
          },
          textToSpeech: { synthesize: batchSpeech },
        },
        deterministicScenarios.alarmListEmpty.text,
        {},
      ),
    ).resolves.toMatchObject({ status: "spoken" });

    expect(streamedAudio).toEqual([
      `stream:${deterministicScenarios.alarmListEmpty.response.text}`,
    ]);
    expect(batchSpeech).not.toHaveBeenCalled();
  });
});
