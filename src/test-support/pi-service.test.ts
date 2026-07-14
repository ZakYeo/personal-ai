import { access } from "node:fs/promises";
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
