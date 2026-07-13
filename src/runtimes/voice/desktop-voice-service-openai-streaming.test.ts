import type { RealtimeSocketFactory } from "../../adapters/openai/openai-realtime-transcription.js";
import { TestRealtimeSocket } from "../../test-support/adapter-contract.js";
import { createOpenAIStreamingServiceConfig } from "../../test-support/desktop-voice-openai-service.js";
import {
  casualConversationSmokeScenarios,
  createFollowUpRealtimeSmoke,
  createSleepingStreamingAudioConfig,
  runCasualConversationStreamingSmoke,
  runOpenAIConversationStreamingActivationSmoke,
} from "../../test-support/desktop-voice-service.js";
import { deterministicScenarios } from "../../test-support/deterministic-scenarios.js";
import { createCapturedWriter, line } from "../../test-support/primitives.js";
import { createServiceSignalController } from "../../test-support/service-runtime.js";
import { runDesktopVoiceServiceRuntime } from "./desktop-voice-service-runtime.js";
import { safeRuntimeFallbackResponse } from "../human-boundary.js";

describe("desktop voice service OpenAI streaming", () => {
  it("aborts streaming speech when shutdown is requested during output", async () => {
    const signals = createServiceSignalController();
    const progressOutput = createCapturedWriter();
    const fallbackOutput = createCapturedWriter();
    const stderr = createCapturedWriter();
    const socket = new TestRealtimeSocket({
      autoOpen: true,
      transcript: deterministicScenarios.alarmListEmpty.text,
    });
    const fetch = vi.fn(() => {
      signals.emit("SIGTERM");

      return Promise.resolve(new Response(Buffer.from("spoken audio")));
    });

    await expect(
      runDesktopVoiceServiceRuntime({
        config: createOpenAIStreamingServiceConfig({
          webSocketFactory: (() => socket) satisfies RealtimeSocketFactory,
        }),
        env: { OPENAI_API_KEY: "test-api-key" },
        fetch,
        io: { fallbackOutput, progressOutput, stderr },
        processSignals: signals,
        retryAfterFailure: () => Promise.resolve(),
      }),
    ).resolves.toEqual({
      status: "stopped",
      turnsCompleted: 1,
    });

    expect(progressOutput.writes).toEqual([
      line('Now listening for wake word "hey jarvis".'),
      line("Wake word detected, now listening..."),
      deterministicScenarios.alarmListEmpty.text,
      line(`Heard: ${deterministicScenarios.alarmListEmpty.text}`),
      line(`Assistant: ${deterministicScenarios.alarmListEmpty.response.text}`),
    ]);
    expect(socket.sentMessages.map((message) => message.type)).toEqual([
      "session.update",
      "input_audio_buffer.append",
      "input_audio_buffer.commit",
    ]);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.openai.test/v1/audio/speech",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(fallbackOutput.writes).toEqual([
      deterministicScenarios.alarmListEmpty.response.text + "\n",
    ]);
    expect(stderr.writes).toEqual([
      line("Runtime failure: OpenAI speech request was aborted."),
    ]);
  });

  it.each(casualConversationSmokeScenarios)(
    "smoke-routes casual streaming speech through conversation: $utterance",
    async ({ responseText, utterance }) => {
      await expect(
        runCasualConversationStreamingSmoke({ responseText, utterance }),
      ).resolves.toEqual({
        fallbackOutput: [],
        progressOutput: [
          line('Now listening for wake word "hey jarvis".'),
          line("Wake word detected, now listening..."),
          utterance,
          line(`Heard: ${utterance}`),
          line(`Assistant: ${responseText}`),
        ],
        result: {
          status: "stopped",
          turnsCompleted: 1,
        },
        stderr: [],
      });
    },
  );

  it("smoke-continues streaming speech for a follow-up capability question without another wake word", async () => {
    const smoke = createFollowUpRealtimeSmoke();

    const result = await runOpenAIConversationStreamingActivationSmoke(smoke);

    expect(result).toEqual({
      status: "stopped",
      turnsCompleted: 1,
    });
    expect(smoke.progressOutput.writes).toEqual([
      line('Now listening for wake word "hey jarvis".'),
      line("Wake word detected, now listening..."),
      smoke.firstUtterance,
      line(`Heard: ${smoke.firstUtterance}`),
      line(`Assistant: ${smoke.firstResponseText}`),
      line("Listening for your reply..."),
      smoke.followUpUtterance,
      line(`Heard: ${smoke.followUpUtterance}`),
      line(`Assistant: ${deterministicScenarios.capabilityList.response.text}`),
    ]);
    expect(smoke.fallbackOutput.writes).toEqual([]);
    expect(smoke.stderr.writes).toEqual([]);
    expect(
      smoke.sockets.flatMap((socket) =>
        socket.sentMessages.map((message) => message.type),
      ),
    ).toEqual([
      "session.update",
      "input_audio_buffer.append",
      "input_audio_buffer.commit",
      "session.update",
      "input_audio_buffer.append",
      "input_audio_buffer.commit",
    ]);
  });

  it("fails the activation cleanly when realtime transcription never completes", async () => {
    const signals = createServiceSignalController();
    const progressOutput = createCapturedWriter();
    const fallbackOutput = createCapturedWriter();
    const stderr = createCapturedWriter();
    const socket = new TestRealtimeSocket({ autoOpen: true });
    const fetch = vi.fn(() => {
      signals.emit("SIGTERM");

      return Promise.resolve(new Response(Buffer.from("spoken audio")));
    });

    await expect(
      runDesktopVoiceServiceRuntime({
        config: createOpenAIStreamingServiceConfig({
          timeoutMs: 100,
          webSocketFactory: (() => socket) satisfies RealtimeSocketFactory,
        }),
        env: { OPENAI_API_KEY: "test-api-key" },
        fetch,
        io: { fallbackOutput, progressOutput, stderr },
        processSignals: signals,
        retryAfterFailure: (context) => {
          context.requestShutdown("test complete");

          return Promise.resolve();
        },
      }),
    ).resolves.toEqual({
      status: "stopped",
      turnsCompleted: 1,
    });

    expect(progressOutput.writes).toEqual([
      line('Now listening for wake word "hey jarvis".'),
      line("Wake word detected, now listening..."),
    ]);
    expect(socket.sentMessages.map((message) => message.type)).toEqual([
      "session.update",
      "input_audio_buffer.append",
      "input_audio_buffer.commit",
    ]);
    expect(socket.closed).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.openai.test/v1/audio/speech",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(fallbackOutput.writes).toEqual([
      safeRuntimeFallbackResponse.text + "\n",
    ]);
    expect(stderr.writes).toEqual([
      line("Runtime failure: Realtime transcription timed out after 100ms."),
      line("Runtime failure: OpenAI speech request was aborted."),
    ]);
  });

  it("cleans up streaming command audio when realtime transcription fails before audio is read", async () => {
    const signals = createServiceSignalController();
    const progressOutput = createCapturedWriter();
    const fallbackOutput = createCapturedWriter();
    const stderr = createCapturedWriter();
    const socket = new TestRealtimeSocket({
      autoOpen: true,
      errorOnSessionUpdate: true,
    });

    await expect(
      runDesktopVoiceServiceRuntime({
        config: createOpenAIStreamingServiceConfig({
          desktopVoice: {
            streamingAudioInput: createSleepingStreamingAudioConfig(),
          },
          webSocketFactory: (() => socket) satisfies RealtimeSocketFactory,
        }),
        env: { OPENAI_API_KEY: "test-api-key" },
        fetch: vi.fn(() => {
          signals.emit("SIGTERM");

          return Promise.resolve(new Response(Buffer.from("spoken audio")));
        }),
        io: { fallbackOutput, progressOutput, stderr },
        processSignals: signals,
        retryAfterFailure: (context) => {
          context.requestShutdown("test complete");

          return Promise.resolve();
        },
      }),
    ).resolves.toEqual({
      status: "stopped",
      turnsCompleted: 1,
    });

    expect(socket.sentMessages.map((message) => message.type)).toEqual([
      "session.update",
    ]);
    expect(progressOutput.writes).toEqual([
      line('Now listening for wake word "hey jarvis".'),
      line("Wake word detected, now listening..."),
    ]);
    expect(fallbackOutput.writes).toEqual([
      safeRuntimeFallbackResponse.text + "\n",
    ]);
    expect(stderr.writes).toEqual([
      line("Runtime failure: Realtime transcription failed."),
      line(
        'Runtime failure event: {"error":{"code":"invalid_request_error","message":"Bad transcription session.","type":"invalid_request_error"},"type":"error"}',
      ),
      line("Runtime failure: OpenAI speech request was aborted."),
    ]);
  });
});
