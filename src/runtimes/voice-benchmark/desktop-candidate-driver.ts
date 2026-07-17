interface CandidateCommand {
  args: string[];
  command: string;
  stdin?: string;
  stdinMode?: "append-as-final-argument" | "direct";
}

const whisperExecutable =
  ".voice-benchmark/install/whisper.cpp-v1.8.6-source/build/bin/whisper-cli";
const sherpaDirectory = ".voice-benchmark/install/sherpa-onnx-v1.13.2-x64";
const sherpaModelDirectory = ".voice-benchmark/install/sherpa-zipformer-en-20m";
const amyDirectory = ".voice-benchmark/install/vits-piper-en_US-amy-low";

export function createSttCandidateCommand(
  candidateId: string,
  inputPath: string,
): CandidateCommand {
  requireSafePath(inputPath, "inputPath");
  if (candidateId === "whisper-base-en" || candidateId === "whisper-small-en") {
    const model = candidateId === "whisper-base-en" ? "base" : "small";
    return {
      args: [
        "-m",
        `.voice-benchmark/artifacts/ggml-${model}.en.bin`,
        "-f",
        inputPath,
        "-nt",
        "-np",
      ],
      command: whisperExecutable,
    };
  }
  if (candidateId === "sherpa-zipformer-en-20m-int8") {
    return {
      args: [
        `--tokens=${sherpaModelDirectory}/tokens.txt`,
        `--encoder=${sherpaModelDirectory}/encoder-epoch-99-avg-1.int8.onnx`,
        `--decoder=${sherpaModelDirectory}/decoder-epoch-99-avg-1.int8.onnx`,
        `--joiner=${sherpaModelDirectory}/joiner-epoch-99-avg-1.int8.onnx`,
        "--num-threads=2",
        "--print-args=false",
        inputPath,
      ],
      command: `${sherpaDirectory}/bin/sherpa-onnx`,
    };
  }
  throw new Error(`Unsupported STT candidate ${candidateId}.`);
}

export function createTtsCandidateCommand(
  candidateId: string,
  text: string,
  outputPath: string,
): CandidateCommand {
  if (text.trim() === "") {
    throw new Error("TTS text must be nonempty.");
  }
  requireSafePath(outputPath, "outputPath");
  if (candidateId === "piper-alba-medium") {
    return {
      args: [
        "-m",
        ".voice-benchmark/artifacts/en_GB-alba-medium.onnx",
        "-c",
        ".voice-benchmark/artifacts/en_GB-alba-medium.onnx.json",
        "-f",
        outputPath,
      ],
      command: ".voice-benchmark/install/piper-v1.4.2-x64/bin/piper",
      stdin: `${text}\n`,
      stdinMode: "direct",
    };
  }
  if (candidateId === "sherpa-amy-low") {
    return {
      args: [
        `--vits-model=${amyDirectory}/en_US-amy-low.onnx`,
        `--vits-tokens=${amyDirectory}/tokens.txt`,
        `--vits-data-dir=${amyDirectory}/espeak-ng-data`,
        `--output-filename=${outputPath}`,
        "--num-threads=2",
        "--print-args=false",
      ],
      command: `${sherpaDirectory}/bin/sherpa-onnx-offline-tts`,
      stdin: `${text}\n`,
      stdinMode: "append-as-final-argument",
    };
  }
  throw new Error(`Unsupported TTS candidate ${candidateId}.`);
}

export function parseSttCandidateTranscript(
  candidateId: string,
  stdout: string,
): string {
  if (candidateId.startsWith("whisper-")) {
    const transcript = stdout.trim();
    if (transcript === "") {
      throw new Error("Whisper candidate returned an empty transcript.");
    }
    return transcript;
  }
  if (candidateId === "sherpa-zipformer-en-20m-int8") {
    const jsonLine = stdout
      .split("\n")
      .find((line) => line.trim().startsWith('{ "text":'));
    if (!jsonLine) {
      throw new Error("Sherpa candidate returned no transcript object.");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonLine) as unknown;
    } catch (error) {
      throw new Error("Sherpa transcript object must be valid JSON.", {
        cause: error,
      });
    }
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("text" in parsed) ||
      typeof parsed.text !== "string" ||
      parsed.text.trim() === ""
    ) {
      throw new Error("Sherpa transcript object must contain nonempty text.");
    }
    return parsed.text;
  }
  throw new Error(`Unsupported STT candidate ${candidateId}.`);
}

function requireSafePath(value: string, label: string): void {
  if (value.startsWith("/") || value.split("/").includes("..")) {
    throw new Error(`${label} must be a safe relative path.`);
  }
}
