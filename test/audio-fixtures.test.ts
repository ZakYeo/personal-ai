import { stat } from "node:fs/promises";
import { join } from "node:path";

const audioFixtureDirectory = join("test", "fixtures", "audio");

const voiceFixtures = [
  {
    expectedMinimumBytes: 40_000,
    fileName: "hey-jarvis.wav",
    spokenText: "Hey Jarvis",
  },
  {
    expectedMinimumBytes: 40_000,
    fileName: "list-my-alarms.wav",
    spokenText: "List my alarms",
  },
  {
    expectedMinimumBytes: 40_000,
    fileName: "list-my-alarms-24khz-mono-s16le.pcm",
    spokenText: "List my alarms",
  },
] as const;

describe("voice audio fixtures", () => {
  it.each(voiceFixtures)(
    "$fileName contains the committed '$spokenText' voice fixture",
    async ({ expectedMinimumBytes, fileName }) => {
      const metadata = await stat(join(audioFixtureDirectory, fileName));

      expect(metadata.isFile()).toBe(true);
      expect(metadata.size).toBeGreaterThan(expectedMinimumBytes);
    },
  );
});
