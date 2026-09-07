import { readFile } from "node:fs/promises";
import { createConfiguredTextRuntimeHarness } from "../../test-support/runtime-composition.js";
import { parseAssistantConfig } from "../config/config.js";

it("keeps rules empty until explicit confirmation and supports ordinary inbox and planning reads", async () => {
  const config = parseAssistantConfig({
    assistant: {
      name: "Jarvis",
      timeZone: "Europe/London",
      wakePhrases: ["hey jarvis"],
    },
    intent: { provider: "deterministic" },
    features: {
      attention: { enabled: true, adapter: "local", timeZone: "Europe/London" },
    },
  });
  const assistant = await createConfiguredTextRuntimeHarness({
    config,
    now: () => new Date("2026-09-07T12:00:00.000Z"),
  });
  expect(
    (await assistant.handleText("show my attention rules")).text,
  ).toContain("no proactive attention rules");
  expect(
    await assistant.handleText(
      "enable task attention named Due work within 1 day",
    ),
  ).toMatchObject({ status: "needs_confirmation" });
  expect(await assistant.handleText("yes")).toMatchObject({ status: "ok" });
  expect(
    (await assistant.handleText("show my attention rules")).text,
  ).toContain("due work is enabled");
  expect(
    (await assistant.handleText("show my attention inbox")).text,
  ).toContain("no open notices");
  expect((await assistant.handleText("help me plan my day")).text).toContain(
    "suggestions",
  );
});

it("keeps proactive attention explicitly disabled in the checked-in default", async () => {
  const config = parseAssistantConfig(
    JSON.parse(
      await readFile(
        new URL("../../../config/default.json", import.meta.url),
        "utf8",
      ),
    ),
  );
  expect(config.features.attention?.enabled).toBe(false);
});
