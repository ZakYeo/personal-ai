import type { RunCommandRequest } from "../../adapters/desktop/command-process.js";
import {
  captureMissingCorpusRecordings,
  inspectCapturedPcmWav,
} from "./corpus-capture.js";
import {
  findMissingRecordings,
  parseCorpusManifest,
  parseRecordingIndex,
} from "./corpus-manifest.js";

const manifestPath = "benchmarks/voice/corpus/personal-phrases.json";
const recordingIndexPath = "benchmarks/voice/corpus/personal-recordings.json";
const personalAudioDirectory = "benchmarks/voice/corpus/personal";
const stagingDirectory = ".voice-benchmark/capture";

interface CaptureAudioProfile {
  playback: {
    afterFileArgs: readonly string[];
    command: string;
  };
  recording: {
    command: string;
    inputArgs: readonly string[];
  };
}

interface CaptureCliDependencies {
  audioProfile?: CaptureAudioProfile | undefined;
  copyFile(source: string, destination: string): Promise<void>;
  makeDirectory(path: string): Promise<void>;
  now(): Date;
  question(prompt: string): Promise<string>;
  readBinaryFile(path: string): Promise<Buffer>;
  readTextFile(path: string): Promise<string>;
  removeFile(path: string): Promise<void>;
  runCommand(
    request: Pick<RunCommandRequest, "args" | "command" | "timeoutMs">,
  ): Promise<void>;
  writeDiagnostic(error: unknown): void;
  writeLine(line: string): void;
  writeTextFile(path: string, contents: string): Promise<void>;
}

export async function runVoiceCorpusCaptureCli(
  args: readonly string[],
  dependencies: CaptureCliDependencies,
): Promise<number> {
  const speakerId = parseSpeakerId(args);
  if (!speakerId) {
    dependencies.writeLine(
      "Usage: npm run benchmark:voice:capture -- --speaker <stable-speaker-id>",
    );
    return 1;
  }

  try {
    const [manifestText, recordingIndexText] = await Promise.all([
      dependencies.readTextFile(manifestPath),
      dependencies.readTextFile(recordingIndexPath),
    ]);
    const manifest = parseCorpusManifest(parseJson(manifestText, manifestPath));
    const existingIndex = parseRecordingIndex(
      parseJson(recordingIndexText, recordingIndexPath),
    );
    const missing = findMissingRecordings(manifest, existingIndex);
    if (missing.length === 0) {
      dependencies.writeLine(
        "All active personal corpus phrases are recorded.",
      );
      return 0;
    }

    dependencies.writeLine(
      `Capturing ${missing.length} missing phrase${missing.length === 1 ? "" : "s"}. Existing recordings will not be replaced.`,
    );
    await dependencies.makeDirectory(stagingDirectory);

    const updatedIndex = await captureMissingCorpusRecordings(
      manifest,
      existingIndex,
      {
        askForConsent: async () => {
          dependencies.writeLine(
            "Accepted recordings will become permanent Git history. They must contain no private facts.",
          );
          return (
            (await dependencies.question(
              'Type "I CONSENT" to promote every accepted recording: ',
            )) === "I CONSENT"
          );
        },
        chooseRecording: async () => {
          const answer = (
            await dependencies.question(
              'Type "accept" to keep this take, or press Enter to rerecord: ',
            )
          )
            .trim()
            .toLocaleLowerCase("en-GB");
          return answer === "accept" ? "accept" : "rerecord";
        },
        inspectRecording: async (filePath) =>
          inspectCapturedPcmWav(await dependencies.readBinaryFile(filePath)),
        now: () => dependencies.now(),
        playRecording: (filePath) =>
          dependencies.runCommand(
            createCaptureAudioCommands(filePath, dependencies.audioProfile)
              .playback,
          ),
        promoteRecording: async ({ phraseId, stagingPath }) => {
          await dependencies.makeDirectory(personalAudioDirectory);
          const destination = `${personalAudioDirectory}/${phraseId}.wav`;
          await dependencies.copyFile(stagingPath, destination);
          return destination;
        },
        recordPhrase: async ({ attempt, phrase }) => {
          const stagingPath = `${stagingDirectory}/${phrase.id}-${attempt}.wav`;
          await dependencies.removeFile(stagingPath);
          dependencies.writeLine(`\nPhrase ${phrase.id}:\n${phrase.text}`);
          await dependencies.question(
            "Press Enter, speak after recording starts, then leave one second of silence: ",
          );
          try {
            await dependencies.runCommand(
              createCaptureAudioCommands(stagingPath, dependencies.audioProfile)
                .recording,
            );
          } catch (error) {
            throw new Error(
              "Microphone recording failed. Check that the configured audio input is available and permitted, then try again.",
              { cause: error },
            );
          }
          return stagingPath;
        },
        reportInvalidRecording: (error) => {
          dependencies.writeLine(
            `Take rejected: ${error instanceof Error ? error.message : "unknown WAV validation failure"}`,
          );
          return Promise.resolve();
        },
        speakerId,
      },
    );

    await dependencies.writeTextFile(
      recordingIndexPath,
      `${JSON.stringify(updatedIndex, undefined, 2)}\n`,
    );
    dependencies.writeLine(
      `Saved ${updatedIndex.recordings.length - existingIndex.recordings.length} new consented recording entries.`,
    );
    return 0;
  } catch (error) {
    dependencies.writeDiagnostic(error);
    dependencies.writeLine(
      `Voice corpus capture failed: ${error instanceof Error ? error.message : "unknown failure"}`,
    );
    return 1;
  }
}

export function createCaptureAudioCommands(
  filePath: string,
  profile: CaptureAudioProfile = {
    playback: { afterFileArgs: [], command: "play" },
    recording: { command: "rec", inputArgs: [] },
  },
): {
  playback: Pick<RunCommandRequest, "args" | "command" | "timeoutMs">;
  recording: Pick<RunCommandRequest, "args" | "command" | "timeoutMs">;
} {
  return {
    playback: {
      args: ["-q", filePath, ...profile.playback.afterFileArgs],
      command: profile.playback.command,
      timeoutMs: 15_000,
    },
    recording: {
      args: [
        "-q",
        ...profile.recording.inputArgs,
        "-r",
        "16000",
        "-c",
        "1",
        "-b",
        "16",
        "-e",
        "signed-integer",
        filePath,
        "trim",
        "0",
        "8",
        "silence",
        "-l",
        "1",
        "0.1",
        "1%",
        "1",
        "1.0",
        "1%",
      ],
      command: profile.recording.command,
      timeoutMs: 11_000,
    },
  };
}

export function selectCaptureAudioProfile(
  pulseServer: string | undefined,
): CaptureAudioProfile | undefined {
  if (!pulseServer) {
    return undefined;
  }
  return {
    playback: {
      afterFileArgs: ["-t", "pulseaudio", "default"],
      command: "sox",
    },
    recording: {
      command: "sox",
      inputArgs: ["-t", "pulseaudio", "default"],
    },
  };
}

function parseSpeakerId(args: readonly string[]): string | undefined {
  if (args.length !== 2 || args[0] !== "--speaker") {
    return undefined;
  }
  const speakerId = args[1];
  return speakerId && /^[a-z\d]+(?:[._-][a-z\d]+)*$/u.test(speakerId)
    ? speakerId
    : undefined;
}

function parseJson(text: string, path: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(`${path} contains invalid JSON.`, { cause: error });
  }
}
