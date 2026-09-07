import type { AudioSetupPort } from "../../ports/audio-setup.js";
import { waitForCleanupWithinDeadline } from "../bounded-cleanup.js";
import { awaitAbortableOperation } from "../abortable-operation.js";

interface AudioSetupSessionOptions {
  readonly audio: AudioSetupPort;
  readonly question: (prompt: string) => Promise<string>;
  readonly writeLine: (line: string) => void;
  readonly reportFailure: (error: unknown) => void;
  readonly signal: AbortSignal;
}

export async function runAudioSetupSession(
  options: AudioSetupSessionOptions,
): Promise<number> {
  const recording: Uint8Array[] = [];
  try {
    const devices = await options.audio.listInputs();
    if (!devices.length) {
      options.writeLine(
        "No microphone was found. Check the cable, operating-system input permissions, and default input, then retry.",
      );
      return 1;
    }
    for (const [index, device] of devices.entries())
      options.writeLine(`${index + 1}. ${device.label}`);
    const selection = await options.question(
      "Microphone number (blank to cancel): ",
    );
    if (!selection.trim()) return 0;
    if (!/^[1-9]\d?$/u.test(selection.trim()))
      throw new Error("Invalid microphone selection.");
    const device = devices[Number(selection.trim()) - 1];
    if (!device) throw new Error("Invalid microphone selection.");
    const permission = await options.question(
      "Stop the assistant voice service first. Record a five-second local test now? Type yes: ",
    );
    if (permission.trim().toLowerCase() !== "yes") return 0;
    options.signal.throwIfAborted();
    options.writeLine(
      "Recording locally for five seconds. Speak at your normal distance.",
    );
    await collectRecording(
      options.audio.capture(device.id, options.signal),
      recording,
      options,
    );
    if (!recording.length) throw new Error("Microphone returned no samples.");
    if (
      (
        await options.question(
          "Play the test through your default output? Type yes: ",
        )
      )
        .trim()
        .toLowerCase() === "yes"
    ) {
      options.signal.throwIfAborted();
      await awaitAbortableOperation(
        options.audio.play(asChunks(recording), options.signal),
        options.signal,
      );
      options.writeLine(
        "Playback completed. If it was silent, check the selected input and output volume.",
      );
    }
    options.writeLine(
      `Selected input: ${device.id}. This test does not change service configuration.`,
    );
    return 0;
  } catch (error) {
    options.reportFailure(error);
    options.writeLine(
      "Audio setup could not finish. Check microphone permissions, the PulseAudio connection, and installed SoX tools, then retry.",
    );
    return 1;
  } finally {
    for (const chunk of recording) chunk.fill(0);
    options.writeLine("Test audio discarded.");
  }
}

async function collectRecording(
  chunks: AsyncIterable<Uint8Array>,
  recording: Uint8Array[],
  options: AudioSetupSessionOptions,
): Promise<void> {
  const iterator = chunks[Symbol.asyncIterator]();
  let bytes = 0;
  let nextLevelAt = 0;
  try {
    while (true) {
      options.signal.throwIfAborted();
      const next = await awaitAbortableOperation(
        iterator.next(),
        options.signal,
      );
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > 240_000)
        throw new Error("Audio test exceeded five seconds of PCM.");
      recording.push(next.value.slice());
      if (bytes >= nextLevelAt) {
        options.writeLine(`Input level: ${peakLevel(next.value)}%.`);
        nextLevelAt = bytes + 12_000;
      }
    }
    if (bytes % 2 !== 0)
      throw new Error("Audio test returned an incomplete PCM sample.");
  } finally {
    const cleanup = await waitForCleanupWithinDeadline(
      Promise.resolve().then(() => iterator.return?.()),
      1_000,
      "Audio test cleanup timed out.",
    );
    if (cleanup) options.reportFailure(cleanup);
  }
}

function peakLevel(chunk: Uint8Array): number {
  const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  let peak = 0;
  for (let offset = 0; offset + 1 < view.byteLength; offset += 2)
    peak = Math.max(peak, Math.abs(view.getInt16(offset, true)));
  return Math.round((peak / 32768) * 100);
}

async function* asChunks(chunks: readonly Uint8Array[]) {
  for (const chunk of chunks) yield await Promise.resolve(chunk);
}
