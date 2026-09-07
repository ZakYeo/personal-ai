import { createServiceFailureBoundary } from "./service-failure-boundary.js";

describe("service failure boundary", () => {
  it("retains failure before a shutdown owner is attached despite failed diagnostics", () => {
    const shutdown = vi.fn();
    const boundary = createServiceFailureBoundary({
      failureReason: "cleanup failed",
      reportFailure: () => {
        throw new Error("diagnostic failure");
      },
    });
    boundary.report(new Error("cleanup stalled"));
    boundary.bindShutdown(shutdown);
    expect(shutdown).toHaveBeenCalledExactlyOnceWith("cleanup failed");
    expect(
      boundary.finish({ status: "stopped", turnsCompleted: 1 }),
    ).toMatchObject({ status: "failed", turnsCompleted: 1 });
  });
});
