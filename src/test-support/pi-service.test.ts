import { access, readFile } from "node:fs/promises";
import {
  createPiServiceAlarmFixture,
  createStopAfterPiServiceFailure,
} from "./pi-service.js";
import { createServiceSignalController } from "./service-runtime.js";

describe("Pi service test support", () => {
  it("derives an isolated alarm fixture from the checked-in Pi config", async () => {
    const fixture = await createPiServiceAlarmFixture();

    await expect(access(fixture.configPath)).resolves.toBeUndefined();
    expect(fixture.rawConfig.intent).toMatchObject({ provider: "openai" });
    await expect(
      readFile(fixture.configPath, "utf8").then(
        (contents) => JSON.parse(contents) as unknown,
      ),
    ).resolves.toMatchObject({
      desktopVoice: {
        wakeActivation: {
          args: [
            "/opt/personal-ai/scripts/openwakeword-listener.py",
            "--model",
            "hey jarvis",
            "--threshold",
            "0.5",
          ],
          command: "/bin/true",
        },
      },
    });

    await fixture.cleanup();
    await expect(access(fixture.configPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("requests shutdown after the first service failure", async () => {
    const signals = createServiceSignalController();
    const onSignal = vi.fn();
    const removeSignal = signals.onSignal("SIGTERM", onSignal);
    const retry = createStopAfterPiServiceFailure(signals);

    await retry();

    expect(onSignal).toHaveBeenCalledOnce();
    removeSignal();
  });
});
