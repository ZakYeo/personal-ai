import { createCapturedWriter, line } from "../../test-support/primitives.js";
import { cleanupVoiceAdapters } from "./voice-cleanup.js";

describe("cleanupVoiceAdapters", () => {
  it("bounds non-settling cleanup and logs the secondary failure", async () => {
    const stderr = createCapturedWriter();

    await expect(
      Promise.race([
        cleanupVoiceAdapters(() => new Promise(() => {}), { stderr }, 10),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error("cleanup did not settle")), 200);
        }),
      ]),
    ).resolves.toBeUndefined();
    expect(stderr.writes).toEqual([
      line(
        "Runtime failure: Voice adapter cleanup did not finish within 10ms.",
      ),
    ]);
  });
});
