import { createResponsePresentationReceipt } from "../../application/response-presentation.js";
import {
  createAssistantWithFeatures,
  createAssistantConfig,
  createCommand,
  createFeature,
  createFixedClock,
  createInterpreter,
} from "../../test-support/core-assistant.js";

describe("assistant presentation receipts", () => {
  it.each(["single", "plan"])(
    "preserves receipts through %s execution and rewriting without recording them",
    async (kind) => {
      const record = vi.fn(() => Promise.resolve());
      const receipt = createResponsePresentationReceipt(record);
      const command = createCommand("test.echo");
      const assistant = createAssistantWithFeatures({
        clock: createFixedClock(),
        config: createAssistantConfig({ test: { enabled: true } }),
        features: [
          createFeature({
            execute: () =>
              Promise.resolve({
                text: "Briefing ready.",
                presentation: receipt,
              }),
          }),
        ],
        intentInterpreter: createInterpreter(
          kind === "single"
            ? command
            : { kind: "plan", plan: { commands: [command, command] } },
        ),
        responseRewriter: {
          rewrite: (request) =>
            Promise.resolve({ text: request.response.text }),
        },
      });
      const outcome = await assistant.handleTextWithDiagnostics("brief me");
      expect(outcome.presentation).toHaveLength(kind === "single" ? 1 : 2);
      expect(outcome.response).not.toHaveProperty("presentation");
      expect(record).not.toHaveBeenCalled();
      await Promise.all(
        outcome.presentation?.map((item) => item.record()) ?? [],
      );
      expect(record).toHaveBeenCalledOnce();
    },
  );
});
