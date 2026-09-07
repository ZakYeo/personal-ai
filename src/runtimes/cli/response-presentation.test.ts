import { createCliIo } from "../../test-support/cli.js";
import { main } from "./main.js";

describe("CLI presentation receipt", () => {
  it("records only after successful text output", async () => {
    const { io, stdout } = createCliIo();
    const record = vi.fn(() => {
      expect(stdout).toEqual(["Briefing.\n"]);
      return Promise.resolve();
    });
    await main(["ask", "brief me"], io, {
      createRuntime: () =>
        Promise.resolve({
          handleText: vi.fn(),
          handleTextWithDiagnostics: () =>
            Promise.resolve({
              response: { status: "ok", text: "Briefing." },
              presentation: [{ record }],
            }),
        }),
    });
    expect(record).toHaveBeenCalledOnce();
  });
});
