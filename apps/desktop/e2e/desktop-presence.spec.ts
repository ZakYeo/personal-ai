import { expect, test } from "@playwright/test";
import type { Assistant } from "../../../src/core/assistant/index.js";
import { createAssistantRuntimeEventStream } from "../../../src/runtimes/presentation/assistant-runtime-event-stream.js";
import { createPresentationControlHandler } from "../../../src/runtimes/presentation/presentation-control-handler.js";
import { createPresentationInteractionCoordinator } from "../../../src/runtimes/presentation/presentation-interaction-coordinator.js";
import {
  startPresentationWebSocketServer,
  type PresentationWebSocketServer,
} from "../../../src/runtimes/presentation/presentation-websocket-server.js";
import { createPresentationProjectionStream } from "../../../src/runtimes/presentation/presentation-projection-stream.js";

const integrationToken = "playwright-authenticated-presentation-token";
const eventStream = createAssistantRuntimeEventStream({
  instanceId: "playwright-service",
  now: () => new Date(),
});
const presentation = createPresentationInteractionCoordinator({
  createInteractionId: () => `interaction-${eventStream.snapshot().sequence}`,
  publish: eventStream.publish.bind(eventStream),
});
const handledTexts: string[] = [];
const assistant: Assistant = {
  handleText: (text) => {
    handledTexts.push(text);
    return Promise.resolve({ status: "ok", text: `Handled ${text}` });
  },
  handleTextWithDiagnostics: (text) => {
    handledTexts.push(text);
    return Promise.resolve({
      response: { status: "ok", text: `Handled ${text}` },
    });
  },
};
const controlHandler = createPresentationControlHandler({
  assistant,
  eventStream,
  presentation,
});
const projectionStream = createPresentationProjectionStream();
let integrationServer: PresentationWebSocketServer;

test.beforeAll(async () => {
  integrationServer = await startIntegrationServer();
});

test.afterAll(async () => {
  await integrationServer.stop();
});

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("command center navigation and request entry remain usable", async ({
  page,
}) => {
  await page.goto("/?e2e=showcase");

  await expect(
    page.getByRole("heading", { level: 1, name: "Today" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Tasks" }).click();
  await expect(page.getByText("Review project notes")).toBeVisible();

  const request = page.getByLabel("Ask Jarvis");
  await request.fill("What comes next?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(request).toHaveValue("");

  await page.getByRole("button", { name: "Settings" }).click();
  const autostart = page.getByRole("checkbox", {
    name: /Start with this computer/u,
  });
  await expect(autostart).not.toBeChecked();
  await autostart.check();
  await expect(autostart).toBeChecked();
});

test("command center matches its wide visual contract", async ({ page }) => {
  await page.setViewportSize({ height: 800, width: 1280 });
  await page.goto("/?e2e=showcase");

  await expect(page).toHaveScreenshot("command-center-wide.png", {
    fullPage: true,
  });
});

test("command center reflows without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ height: 900, width: 480 });
  await page.goto("/?e2e=showcase");

  const layout = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(layout.scrollWidth).toBe(layout.clientWidth);
  await expect(page).toHaveScreenshot("command-center-narrow.png", {
    fullPage: true,
  });
});

test("overlay exposes exact confirmation and keyboard focus", async ({
  page,
}) => {
  await page.setViewportSize({ height: 420, width: 560 });
  await page.goto("/?window=overlay&e2e=showcase");

  await expect(
    page.getByText("Send ‘Running five minutes late’ to Alex?"),
  ).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Confirm" })).toBeFocused();
  await expect(page).toHaveScreenshot("overlay-confirmation.png", {
    fullPage: true,
  });
  await page.getByRole("button", { name: "Confirm" }).click();
});

test("authenticated service events and controls traverse the real UI path", async ({
  context,
  page,
}) => {
  handledTexts.length = 0;
  await page.goto("/?e2e=integration");
  await expect(page.getByText("Service connected")).toBeVisible();
  const overlay = await context.newPage();
  await overlay.goto("/?window=overlay&e2e=integration");

  const interaction = presentation.beginInteraction();
  interaction.transcriptDelta("set a tea ");
  await expect(overlay.getByText(/set a tea/u)).toBeVisible();
  interaction.transcriptFinal("set a tea alarm");
  interaction.processing();
  interaction.confirmation("Set a tea alarm for 11am?");
  await expect(overlay.getByText("Set a tea alarm for 11am?")).toBeVisible();
  await overlay.getByRole("button", { name: "Confirm" }).click();
  await expect(
    overlay.getByRole("main", { name: "Overlay dismissed" }),
  ).toBeHidden();
  expect(handledTexts).toEqual(["yes"]);

  await page.getByLabel("Ask Jarvis").fill("force rejection");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "This request was rejected by the integration fixture.",
  );

  await integrationServer.stop();
  await expect(page.getByText("Service offline")).toBeVisible();
  const replayed = presentation.beginInteraction();
  replayed.transcriptFinal("reconnect me");
  replayed.processing();
  integrationServer = await startIntegrationServer();
  await expect(page.getByText("Service connected")).toBeVisible();
  await expect(overlay.getByText("reconnect me")).toBeVisible();
  replayed.response({ status: "ok", text: "Reconnected safely." });
  replayed.completed();
  await expect(
    overlay.getByRole("main", { name: "Overlay dismissed" }),
  ).toBeHidden();
});

test("malformed authenticated messages fail closed in the browser client", async ({
  page,
}) => {
  await page.routeWebSocket("ws://127.0.0.1:43119", (socket) => {
    socket.onMessage(() => {
      socket.send(
        JSON.stringify({
          protocolVersion: 1,
          snapshot: {
            instanceId: "malformed-fixture",
            microphone: "available",
            sequence: 0,
            wakeListening: false,
          },
          type: "snapshot",
        }),
      );
      socket.send(
        JSON.stringify({
          privateDiagnostics: "must never be displayed",
          protocolVersion: 1,
          type: "projection",
        }),
      );
    });
  });
  await page.goto("/?e2e=integration");

  await expect(page.getByText("Service offline")).toBeVisible();
  await expect(page.getByText("must never be displayed")).toHaveCount(0);
});

function startIntegrationServer(): Promise<PresentationWebSocketServer> {
  return startPresentationWebSocketServer({
    eventStream,
    handleControl: (control) =>
      control.type === "submit_text" && control.text === "force rejection"
        ? Promise.resolve({
            message: "This request was rejected by the integration fixture.",
            status: "rejected",
          })
        : controlHandler(control),
    port: 43_119,
    projectionStream,
    token: integrationToken,
  });
}
