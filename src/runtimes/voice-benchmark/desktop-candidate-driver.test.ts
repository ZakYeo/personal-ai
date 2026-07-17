import {
  createSttCandidateCommand,
  createTtsCandidateCommand,
  parseSttCandidateTranscript,
} from "./desktop-candidate-driver.js";

describe("desktop voice benchmark candidate drivers", () => {
  it("constructs whisper and sherpa STT commands without a shell", () => {
    const whisper = createSttCandidateCommand(
      "whisper-base-en",
      "benchmarks/private/list.wav",
    );
    expect(whisper.args).toContain(
      ".voice-benchmark/artifacts/ggml-base.en.bin",
    );
    expect(whisper.args.at(-1)).not.toBe("benchmarks/private/list.wav");
    expect(whisper.args).toContain("benchmarks/private/list.wav");

    const sherpa = createSttCandidateCommand(
      "sherpa-zipformer-en-20m-int8",
      "benchmarks/private/list.wav",
    );
    expect(sherpa.args).toContain("--print-args=false");
    expect(sherpa.args.at(-1)).toBe("benchmarks/private/list.wav");
  });

  it("passes private TTS text only through stdin", () => {
    const command = createTtsCandidateCommand(
      "piper-alba-medium",
      "Your appointment is at 11am.",
      ".voice-benchmark/results/sample.wav",
    );
    expect(command.stdin).toBe("Your appointment is at 11am.\n");
    expect(command.args.join(" ")).not.toContain("appointment");
  });

  it("extracts transcripts from both engine output formats", () => {
    expect(
      parseSttCandidateTranscript("whisper-base-en", " list my alarms.\n"),
    ).toBe("list my alarms.");
    expect(
      parseSttCandidateTranscript(
        "sherpa-zipformer-en-20m-int8",
        'noise\n{ "text": "LIST MY ALARMS", "tokens": [] }\n',
      ),
    ).toBe("LIST MY ALARMS");
    expect(() => parseSttCandidateTranscript("unknown", "text")).toThrow(
      /candidate/iu,
    );
  });
});
