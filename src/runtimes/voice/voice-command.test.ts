import { deterministicScenarios } from "../../test-support/deterministic-scenarios.js";
import { createVoiceRuntimeDependencies } from "../../test-support/voice-runtime.js";
import { runDetectedVoiceCommand } from "./voice-command.js";

describe("runDetectedVoiceCommand", () => {
  it("speaks natural citation titles without passing link targets to text-to-speech", async () => {
    const synthesize = vi.fn((text: string) => Promise.resolve({ text }));
    const response = {
      citations: [
        {
          title: "Donald Trump",
          url: "https://en.wikipedia.org/wiki/Donald_Trump?utm_source=openai",
        },
      ],
      status: "ok" as const,
      text: "Donald Trump was born on June 14, 1946. Source: Donald Trump.",
    };
    const dependencies = createVoiceRuntimeDependencies({
      assistant: {
        handleText: () => Promise.resolve(response),
        handleTextWithDiagnostics: () =>
          Promise.resolve({
            response,
          }),
      },
    });

    await runDetectedVoiceCommand(
      { ...dependencies, textToSpeech: { synthesize } },
      "Search the web for Donald Trump's birthday.",
      {},
    );

    expect(synthesize).toHaveBeenCalledWith(response.text);
    expect(JSON.stringify(synthesize.mock.calls)).not.toContain("https://");
  });

  it("forwards service shutdown cancellation to assistant handling", async () => {
    const shutdown = new AbortController();
    const handleTextWithDiagnostics = vi.fn(() =>
      Promise.resolve({
        response: deterministicScenarios.alarmListEmpty.response,
      }),
    );
    const dependencies = createVoiceRuntimeDependencies({
      assistant: {
        handleText: vi.fn(),
        handleTextWithDiagnostics,
      },
    });

    await runDetectedVoiceCommand(
      { ...dependencies, shutdownSignal: shutdown.signal },
      deterministicScenarios.alarmListEmpty.text,
      {},
    );

    expect(handleTextWithDiagnostics).toHaveBeenCalledWith(
      deterministicScenarios.alarmListEmpty.text,
      { signal: shutdown.signal },
    );
  });

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
