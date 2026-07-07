import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const audioFixtureDirectory = join("test", "fixtures", "audio");

const voiceFixtures = [
  {
    expectedBytes: 93_678,
    fileName: "hey-jarvis.wav",
    samples: 46_800,
    spokenText: "Hey Jarvis",
  },
  {
    expectedBytes: 146_478,
    fileName: "list-my-alarms.wav",
    samples: 73_200,
    spokenText: "List my alarms",
  },
] as const;

const rawPcmVoiceFixtures = [
  {
    expectedBytes: 146_400,
    fileName: "list-my-alarms-24khz-mono-s16le.pcm",
    samples: 73_200,
    spokenText: "List my alarms",
  },
] as const;

describe("voice audio fixtures", () => {
  it.each(voiceFixtures)(
    "$fileName contains the committed '$spokenText' WAV voice fixture",
    async ({ expectedBytes, fileName, samples }) => {
      const fixturePath = join(audioFixtureDirectory, fileName);
      const metadata = await stat(fixturePath);

      expect(metadata.isFile()).toBe(true);
      expect(metadata.size).toBe(expectedBytes);
      expect(parsePcmWavMetadata(await readFile(fixturePath))).toEqual({
        bitsPerSample: 16,
        channels: 1,
        dataBytes: samples * 2,
        sampleRate: 24_000,
      });
    },
  );

  it.each(rawPcmVoiceFixtures)(
    "$fileName contains the committed '$spokenText' raw PCM voice fixture",
    async ({ expectedBytes, fileName, samples }) => {
      const metadata = await stat(join(audioFixtureDirectory, fileName));

      expect(metadata.isFile()).toBe(true);
      expect(metadata.size).toBe(expectedBytes);
      expect(metadata.size).toBe(samples * 2);
    },
  );
});

function parsePcmWavMetadata(audio: Buffer): {
  bitsPerSample: number;
  channels: number;
  dataBytes: number;
  sampleRate: number;
} {
  expect(audio.toString("ascii", 0, 4)).toBe("RIFF");
  expect(audio.toString("ascii", 8, 12)).toBe("WAVE");

  const formatChunk = findWavChunk(audio, "fmt ");
  const dataChunk = findWavChunk(audio, "data");

  expect(audio.readUInt16LE(formatChunk.offset)).toBe(1);

  return {
    bitsPerSample: audio.readUInt16LE(formatChunk.offset + 14),
    channels: audio.readUInt16LE(formatChunk.offset + 2),
    dataBytes: dataChunk.size,
    sampleRate: audio.readUInt32LE(formatChunk.offset + 4),
  };
}

function findWavChunk(
  audio: Buffer,
  chunkId: string,
): { offset: number; size: number } {
  let cursor = 12;

  while (cursor + 8 <= audio.length) {
    const id = audio.toString("ascii", cursor, cursor + 4);
    const size = audio.readUInt32LE(cursor + 4);
    const offset = cursor + 8;

    if (id === chunkId) {
      return { offset, size };
    }

    cursor = offset + size + (size % 2);
  }

  throw new Error(`WAV chunk ${chunkId} was not found.`);
}
