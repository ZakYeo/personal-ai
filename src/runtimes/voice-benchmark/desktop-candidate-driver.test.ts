import {
  createSttCandidateCommand,
  createTtsCandidateCommand,
  parseSttCandidateTranscript,
} from "./desktop-candidate-driver.js";
import { parseCandidateManifest } from "./candidate-manifest.js";

const sttCandidate = createCandidate("stt", "plain");
const ttsCandidate = createCandidate("tts");

describe("desktop voice benchmark candidate drivers", () => {
  it("constructs whisper and sherpa STT commands without a shell", () => {
    const whisper = createSttCandidateCommand(
      sttCandidate,
      "benchmarks/private/list.wav",
    );
    expect(whisper.args).toContain("benchmarks/private/list.wav");
  });

  it("passes private TTS text only through stdin", () => {
    const command = createTtsCandidateCommand(
      ttsCandidate,
      ".voice-benchmark/results/sample.wav",
    );
    expect(command.args.join(" ")).not.toContain("appointment");
  });

  it("extracts transcripts from both engine output formats", () => {
    expect(
      parseSttCandidateTranscript(sttCandidate, " list my alarms.\n"),
    ).toBe("list my alarms.");
  });
});

function createCandidate(operation: "stt" | "tts", transcriptFormat?: "plain") {
  return parseCandidateManifest({
    schemaVersion: 1,
    candidates: [
      {
        artifactIds: ["artifact"],
        desktopDriver: {
          args:
            operation === "stt"
              ? ["--input", "{input}"]
              : ["--output", "{output}"],
          command: ".voice-benchmark/bin/engine",
          environment: {},
          ...(transcriptFormat ? { transcriptFormat } : {}),
        },
        engine: operation === "stt" ? "whisper.cpp" : "piper",
        executable: "bin/engine",
        id: `${operation}-candidate`,
        installDirectory: "engine",
        modelFiles: ["model"],
        operation,
        revision: "revision",
      },
    ],
  }).candidates[0]!;
}
