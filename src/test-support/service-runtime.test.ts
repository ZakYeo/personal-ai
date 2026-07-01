import { createServiceSignalController } from "./service-runtime.js";

describe("service runtime test support", () => {
  it("captures and unregisters injected service signal handlers", () => {
    const signals = createServiceSignalController();
    const handler = vi.fn();
    const unregister = signals.onSignal("SIGTERM", handler);

    signals.emit("SIGTERM");
    unregister();
    signals.emit("SIGTERM");

    expect(handler).toHaveBeenCalledTimes(1);
    expect(signals.listenerCount("SIGTERM")).toBe(0);
  });
});
