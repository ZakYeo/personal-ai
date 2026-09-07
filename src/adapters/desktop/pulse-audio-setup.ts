import type {
  AudioSetupPort,
  AudioSetupDevice,
} from "../../ports/audio-setup.js";
import { isRecord } from "../parsing.js";
import type {
  runCommand,
  runCommandReadableStream,
  runCommandWritableStream,
} from "./process-runner.js";

export function createPulseAudioSetup(options: {
  readonly run: typeof runCommand;
  readonly read: typeof runCommandReadableStream;
  readonly write: typeof runCommandWritableStream;
  readonly environment: Record<string, string | undefined>;
}): AudioSetupPort {
  let devices: readonly AudioSetupDevice[] = [];
  const pcm = [
    "-r",
    "24000",
    "-c",
    "1",
    "-b",
    "16",
    "-e",
    "signed-integer",
    "-t",
    "raw",
  ];
  return {
    async listInputs() {
      devices = [];
      const result = await options.run({
        command: "pactl",
        args: ["--format=json", "list", "sources"],
        environment: options.environment,
        timeoutMs: 5_000,
      });
      if (result.stdoutTruncated)
        throw new Error("Audio device listing exceeded its bound.");
      devices = parseDevices(JSON.parse(result.stdout));
      return devices;
    },
    capture(deviceId, signal) {
      if (!devices.some((device) => device.id === deviceId))
        throw new Error(
          "Audio input was not selected from discovered devices.",
        );
      return options.read({
        command: "sox",
        args: [
          "-q",
          "-t",
          "pulseaudio",
          deviceId,
          ...pcm,
          "-",
          "trim",
          "0",
          "5",
        ],
        environment: options.environment,
        signal,
        timeoutMs: 8_000,
      }).chunks;
    },
    play(chunks, signal) {
      return options.write(
        {
          command: "sox",
          args: ["-q", ...pcm, "-", "-t", "pulseaudio", "default"],
          environment: options.environment,
          signal,
          timeoutMs: 8_000,
        },
        chunks,
      );
    },
  };
}

function parseDevices(value: unknown): readonly AudioSetupDevice[] {
  if (!Array.isArray(value) || value.length > 128)
    throw new Error("Audio device list is malformed or too large.");
  const devices: AudioSetupDevice[] = [];
  const names = new Set<string>();
  for (const item of value) {
    if (
      !isRecord(item) ||
      typeof item.name !== "string" ||
      !/^[\w.-]{1,256}$/u.test(item.name) ||
      typeof item.description !== "string" ||
      item.description.length === 0 ||
      item.description.length > 256 ||
      names.has(item.name)
    )
      throw new Error("Audio device entry is malformed.");
    names.add(item.name);
    // PulseAudio v17 pactl.c uses monitor_source, with an empty string for inputs.
    // https://github.com/pulseaudio/pulseaudio/blob/v17.0/src/utils/pactl.c
    const monitor: unknown = Object.hasOwn(item, "monitor_of_sink")
      ? item.monitor_of_sink
      : item.monitor_source;
    if (monitor !== null && typeof monitor !== "string")
      throw new Error("Audio device monitor metadata is malformed.");
    if ((monitor !== null && monitor !== "") || item.name.endsWith(".monitor"))
      continue;
    devices.push(Object.freeze({ id: item.name, label: item.description }));
  }
  return Object.freeze(devices);
}
