import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { createDesktopApp } from "./composition/create-desktop-app.js";
import { createPresentationWebSocketClient } from "./infrastructure/presentation-websocket-client.js";
import { createPresentationRelayClient } from "./infrastructure/presentation-relay-client.js";
import { createTauriDesktopHost } from "./infrastructure/tauri-desktop-host.js";
import {
  loadBrowserTestPresentationConfig,
  loadPresentationConnectionConfig,
} from "./infrastructure/tauri-presentation-config.js";
import type { DesktopMode } from "./model/navigation.js";
import { desktopShowcaseState } from "./model/showcase-state.js";
import "./styles/index.css";

const mode =
  new URLSearchParams(window.location.search).get("window") === "overlay"
    ? "overlay"
    : "command-center";

const root = document.querySelector("#root");
if (!root) throw new Error("Desktop application root was not found.");

void startDesktopApplication(root, mode satisfies DesktopMode);

async function startDesktopApplication(
  container: Element,
  desktopMode: DesktopMode,
): Promise<void> {
  const connection =
    desktopMode === "command-center"
      ? await loadPresentationConnectionConfig().catch(() => null)
      : null;
  const resolvedConnection =
    connection ??
    (desktopMode === "command-center" && isIntegrationRequested()
      ? loadBrowserTestPresentationConfig()
      : null);
  const directClient = resolvedConnection
    ? createPresentationWebSocketClient(resolvedConnection)
    : undefined;
  const presentationClient = directClient
    ? createPresentationRelayClient({
        directClient,
        role: "leader",
      })
    : desktopMode === "overlay"
      ? createPresentationRelayClient({ role: "satellite" })
      : undefined;
  const host = createTauriDesktopHost((control) =>
    presentationClient
      ? presentationClient.sendControl(control)
      : Promise.reject(new Error("Presentation service is offline.")),
  );
  const viewModel = createDesktopApp({
    host,
    ...(isShowcaseRequested() ? { initialState: desktopShowcaseState } : {}),
    mode: desktopMode,
    ...(presentationClient ? { presentationClient } : {}),
  });
  createRoot(container).render(
    <StrictMode>
      <App viewModel={viewModel} />
    </StrictMode>,
  );
}

function isShowcaseRequested(): boolean {
  return (
    import.meta.env.MODE === "test" &&
    new URLSearchParams(window.location.search).get("e2e") === "showcase"
  );
}

function isIntegrationRequested(): boolean {
  return (
    import.meta.env.MODE === "test" &&
    new URLSearchParams(window.location.search).get("e2e") === "integration"
  );
}
