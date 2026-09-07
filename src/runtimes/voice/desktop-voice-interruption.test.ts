import * as presentationRuntime from "../presentation/desktop-presentation-runtime.js";
import type {
  PresentationControl,
  PresentationControlResult,
} from "../../ports/presentation.js";
import { createDesktopVoiceConfig } from "../../test-support/desktop-voice-runtime.js";
import { createServiceSignalController } from "../../test-support/service-runtime.js";
import { runDesktopVoiceServiceRuntime } from "./desktop-voice-service-runtime.js";

describe("desktop voice interruption composition", () => {
  it("routes desktop stop to the active turn and the exact shared notification output", async () => {
    const createPresentation =
      presentationRuntime.createDesktopPresentationRuntime;
    let handleControl:
      | ((control: PresentationControl) => Promise<PresentationControlResult>)
      | undefined;
    const replacement = vi
      .spyOn(presentationRuntime, "createDesktopPresentationRuntime")
      .mockImplementation((options) =>
        createPresentation({
          ...options,
          startServer: (server) => {
            handleControl = server.handleControl;
            return Promise.resolve({
              port: server.port,
              stop: () => Promise.resolve(),
            });
          },
        }),
      );
    const signals = createServiceSignalController();
    const queuedDelivery = vi.fn(() => Promise.resolve());
    try {
      const result = await runDesktopVoiceServiceRuntime({
        config: createDesktopVoiceConfig("list alarms"),
        env: {
          PERSONAL_AI_PRESENTATION_TOKEN:
            "a-secure-presentation-token-with-32-characters",
        },
        processSignals: signals,
        runVoiceActivation: async ({ turnController, outputCoordinator }) => {
          if (!turnController || !outputCoordinator || !handleControl)
            throw new Error("Missing interruption composition.");
          const turn = turnController.begin();
          const activeOutput = outputCoordinator.run(
            (signal) =>
              new Promise<void>((resolve) => {
                signal.addEventListener("abort", () => resolve(), {
                  once: true,
                });
              }),
          );
          const queued = outputCoordinator.run(queuedDelivery);
          const outputs = Promise.allSettled([activeOutput, queued]);
          await Promise.resolve();
          const stopped = handleControl({
            type: "stop_listening",
            requestId: "stop",
          });
          expect(turn.signal.aborted).toBe(true);
          turn.dispose();
          await expect(stopped).resolves.toEqual({ status: "accepted" });
          expect((await outputs).map((outcome) => outcome.status)).toEqual([
            "rejected",
            "rejected",
          ]);
          signals.emit("SIGTERM");
          return {
            status: "cancelled",
            response: { status: "ok", text: "Stopped." },
            textOutputWritten: false,
          };
        },
      });
      expect(result.status).toBe("stopped");
      expect(queuedDelivery).not.toHaveBeenCalled();
    } finally {
      replacement.mockRestore();
    }
  });
});
