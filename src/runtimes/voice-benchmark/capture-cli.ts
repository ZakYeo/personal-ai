import type { RunCommandRequest } from "../../adapters/desktop/command-process.js";
import {
  captureMissingCorpusRecordings,
  inspectCapturedPcmWav,
} from "./corpus-capture.js";
import {
  type CaptureScope,
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
    request: Pick<
      RunCommandRequest,
      "args" | "command" | "signal" | "timeoutMs"
    >,
  ): Promise<void>;
  shutdownSignal?: AbortSignal | undefined;
  writeDiagnostic(error: unknown): void;
  writeLine(line: string): void;
  writeTextFile(path: string, contents: string): Promise<void>;
}

export async function runVoiceCorpusCaptureCli(
  args: readonly string[],
  dependencies: CaptureCliDependencies,
): Promise<number> {
  const captureArguments = parseCaptureArguments(args);
  if (!captureArguments) {
    dependencies.writeLine(
      "Usage: npm run benchmark:voice:capture -- --speaker <stable-speaker-id> [--all]",
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
    const missing = findMissingRecordings(
      manifest,
      existingIndex,
      captureArguments.scope,
    );
    if (missing.length === 0) {
      dependencies.writeLine(
        captureArguments.scope === "core"
          ? "All core personal corpus phrases are recorded."
          : "All active personal corpus phrases are recorded.",
      );
      return 0;
    }

    dependencies.writeLine(
      `Capturing ${missing.length} missing ${captureArguments.scope === "core" ? "core " : ""}phrase${missing.length === 1 ? "" : "s"}. Existing recordings will not be replaced.`,
    );
    await dependencies.makeDirectory(stagingDirectory);

    const result = await captureMissingCorpusRecordings(
      manifest,
      existingIndex,
      {
        askForConsent: async () => {
          dependencies.writeLine(
            "Accepted recordings will become permanent Git history. They must contain no private facts.",
          );
          return (
            (await dependencies.question(
              'Type "I CONSENT" to begin, or "quit" to exit: ',
            )) === "I CONSENT"
          );
        },
        chooseRecording: async () => {
          const answer = (
            await dependencies.question(
              'Type "accept" to save this take, "quit" to exit, or press Enter to rerecord: ',
            )
          )
            .trim()
            .toLocaleLowerCase("en-GB");
          if (answer === "accept" || answer === "quit") {
            return answer;
          }
          return "rerecord";
        },
        inspectRecording: async (filePath) =>
          inspectCapturedPcmWav(await dependencies.readBinaryFile(filePath)),
        now: () => dependencies.now(),
        playRecording: (filePath) =>
          dependencies.runCommand({
            ...createCaptureAudioCommands(filePath, dependencies.audioProfile)
              .playback,
            ...(dependencies.shutdownSignal
              ? { signal: dependencies.shutdownSignal }
              : {}),
          }),
        promoteRecording: async ({ phraseId, stagingPath }) => {
          try {
            await dependencies.makeDirectory(personalAudioDirectory);
            const destination = `${personalAudioDirectory}/${phraseId}.wav`;
            await dependencies.copyFile(stagingPath, destination);
            return destination;
          } catch (error) {
            throw createCheckpointError(error);
          }
        },
        recordPhrase: async ({ attempt, phrase }) => {
          const stagingPath = `${stagingDirectory}/${phrase.id}-${attempt}.wav`;
          await dependencies.removeFile(stagingPath);
          try {
            await dependencies.runCommand({
              ...createCaptureAudioCommands(
                stagingPath,
                dependencies.audioProfile,
              ).recording,
              ...(dependencies.shutdownSignal
                ? { signal: dependencies.shutdownSignal }
                : {}),
            });
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
        saveRecordingIndex: async (index) => {
          try {
            await dependencies.writeTextFile(
              recordingIndexPath,
              `${JSON.stringify(index, undefined, 2)}\n`,
            );
          } catch (error) {
            throw createCheckpointError(error);
          }
        },
        scope: captureArguments.scope,
        speakerId: captureArguments.speakerId,
        startRecording: async ({ phrase }) => {
          dependencies.writeLine(`\nPhrase ${phrase.id}:\n${phrase.text}`);
          const answer = (
            await dependencies.question(
              'Press Enter to record, speak after recording starts, then leave two seconds of silence; or type "quit" to exit: ',
            )
          )
            .trim()
            .toLocaleLowerCase("en-GB");
          return answer === "quit" ? "quit" : "record";
        },
      },
    );

    const savedCount =
      result.index.recordings.length - existingIndex.recordings.length;
    dependencies.writeLine(
      result.status === "paused"
        ? `Voice corpus capture paused. ${savedCount} accepted recording${savedCount === 1 ? " is" : "s are"} saved.`
        : `Saved ${savedCount} new consented recording entries.`,
    );
    return 0;
  } catch (error) {
    if (dependencies.shutdownSignal?.aborted) {
      dependencies.writeLine(
        "Voice corpus capture paused. Previously accepted recordings are saved.",
      );
      return 0;
    }
    dependencies.writeDiagnostic(error);
    dependencies.writeLine(
      `Voice corpus capture failed: ${error instanceof Error ? error.message : "unknown failure"}`,
    );
    return 1;
  }
}

function createCheckpointError(cause: unknown): Error {
  return new Error(
    "Accepted recording could not be saved. Check repository write permissions, then retry.",
    { cause },
  );
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
      timeoutMs: 20_000,
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
        "15",
        "silence",
        "-l",
        "1",
        "0.1",
        "1%",
        "1",
        "2.0",
        "1%",
      ],
      command: profile.recording.command,
      timeoutMs: 18_000,
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

export function parseCaptureArguments(
  args: readonly string[],
): { scope: CaptureScope; speakerId: string } | undefined {
  if (
    (args.length !== 2 && args.length !== 3) ||
    args[0] !== "--speaker" ||
    (args.length === 3 && args[2] !== "--all")
  ) {
    return undefined;
  }
  const speakerId = args[1];
  if (!speakerId || !/^[a-z\d]+(?:[._-][a-z\d]+)*$/u.test(speakerId)) {
    return undefined;
  }
  return { scope: args.length === 3 ? "all" : "core", speakerId };
}

function parseJson(text: string, path: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(`${path} contains invalid JSON.`, { cause: error });
  }
}
