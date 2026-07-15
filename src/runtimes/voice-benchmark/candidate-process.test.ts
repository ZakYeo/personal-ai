import {
  executeSttCandidateProcess,
  executeTtsCandidateProcess,
} from "./candidate-process.js";

describe("voice benchmark candidate processes", () => {
  it("passes STT audio by path without exposing expected text", async () => {
    const requests: unknown[] = [];
    const result = await executeSttCandidateProcess(
      {
        args: ["--model", "model.bin", "--input", "{input}"],
        command: "/opt/benchmark/whisper-driver",
        environment: { PATH: "/usr/bin" },
        timeoutMs: 20_000,
      },
      "benchmarks/private/list.wav",
      {
        runCommand: (request) => {
          requests.push(request);
          return Promise.resolve({
            stderr: "internal timing details",
            stdout: JSON.stringify(createSttOutput()),
          });
        },
      },
    );

    expect(requests).toEqual([
      {
        args: [
          "--model",
          "model.bin",
          "--input",
          "benchmarks/private/list.wav",
        ],
        command: "/opt/benchmark/whisper-driver",
        environment: { PATH: "/usr/bin" },
        timeoutMs: 20_000,
      },
    ]);
    expect(result.transcript).toBe("List my alarms");
  });

  it("sends private TTS text only through stdin", async () => {
    const requests: Array<{ args?: string[]; stdin?: string }> = [];
    const text = "Your private appointment is at 11am.";

    await executeTtsCandidateProcess(
      {
        args: ["--model", "voice.onnx"],
        command: "/opt/benchmark/piper-driver",
        environment: { PATH: "/usr/bin" },
        timeoutMs: 20_000,
      },
      text,
      {
        runCommand: (request) => {
          requests.push(request);
          return Promise.resolve({
            stderr: "",
            stdout: JSON.stringify(createTtsOutput()),
          });
        },
      },
    );

    expect(requests[0]?.stdin).toBe(text);
    expect(requests[0]?.args?.join(" ")).not.toContain("appointment");
  });

  it("rejects malformed, negative, and non-JSON driver output", async () => {
    const profile = {
      args: ["{input}"],
      command: "candidate-driver",
      environment: {},
      timeoutMs: 20_000,
    };

    await expect(
      executeSttCandidateProcess(profile, "input.wav", {
        runCommand: () => Promise.resolve({ stderr: "", stdout: "not-json" }),
      }),
    ).rejects.toThrow(/JSON/iu);
    await expect(
      executeSttCandidateProcess(profile, "input.wav", {
        runCommand: () =>
          Promise.resolve({
            stderr: "",
            stdout: JSON.stringify({ ...createSttOutput(), peakRssBytes: -1 }),
          }),
      }),
    ).rejects.toThrow(/peakRssBytes/iu);
  });

  it("requires exactly one explicit STT input placeholder", async () => {
    const execute = (args: string[]) =>
      executeSttCandidateProcess(
        {
          args,
          command: "candidate-driver",
          environment: {},
          timeoutMs: 20_000,
        },
        "input.wav",
        {
          runCommand: () =>
            Promise.resolve({
              stderr: "",
              stdout: JSON.stringify(createSttOutput()),
            }),
        },
      );

    await expect(execute([])).rejects.toThrow(/exactly one.*\{input\}/iu);
    await expect(execute(["{input}", "{input}"])).rejects.toThrow(
      /exactly one.*\{input\}/iu,
    );
  });
});

function createSttOutput() {
  return {
    cpuMs: 300,
    finalizationMs: 400,
    peakRssBytes: 40_000_000,
    realTimeFactor: 0.2,
    shutdownMs: 20,
    startupMs: 100,
    transcript: "List my alarms",
  };
}

function createTtsOutput() {
  return {
    audioDurationMs: 2_000,
    audioSha256: "c".repeat(64),
    cpuMs: 200,
    firstAudioMs: 250,
    peakRssBytes: 30_000_000,
    realTimeFactor: 0.1,
    shutdownMs: 10,
    startupMs: 80,
  };
}
