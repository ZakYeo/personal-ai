import { createLoadedRuntimeConfig } from "../../test-support/core-assistant.js";
import { runConfigurationCheck } from "./configuration-check.js";

describe("configuration setup boundary", () => {
  it.each([false, true])(
    "verifies read surfaces only with an explicit flag (%s)",
    async (verifyRequested) => {
      const verify = vi
        .fn()
        .mockResolvedValue([
          { label: "Calendar", status: "connected", lastCheck: "10am" },
        ]);
      const writeLine = vi.fn();
      const code = await runConfigurationCheck(
        ["--config", "selected.json", ...(verifyRequested ? ["--verify"] : [])],
        {
          load: () =>
            Promise.resolve({
              config: createLoadedRuntimeConfig({}),
              configDirectory: "/tmp",
            }),
          verify,
          writeLine,
          reportFailure: vi.fn(),
        },
      );
      expect(code).toBe(0);
      expect(verify).toHaveBeenCalledTimes(verifyRequested ? 1 : 0);
      expect(
        writeLine.mock.calls
          .flat()
          .filter((line) => line === "Calendar: connected · 10am"),
      ).toEqual(verifyRequested ? ["Calendar: connected · 10am"] : []);
    },
  );

  it("keeps failed verification details internal and returns failure", async () => {
    const reportFailure = vi.fn();
    const writeLine = vi.fn();
    const failure = new Error("private credential failure");
    expect(
      await runConfigurationCheck(["--config", "selected.json", "--verify"], {
        load: () =>
          Promise.resolve({
            config: createLoadedRuntimeConfig({}),
            configDirectory: "/tmp",
          }),
        verify: () => Promise.reject(failure),
        writeLine,
        reportFailure,
      }),
    ).toBe(1);
    expect(reportFailure).toHaveBeenCalledWith(failure);
    expect(writeLine.mock.calls.flat().join("\n")).not.toContain(
      "private credential",
    );
  });
});
