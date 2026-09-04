import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { createDesktopApp } from "./composition/create-desktop-app.js";
import { createTauriDesktopHost } from "./infrastructure/tauri-desktop-host.js";
import type { DesktopMode } from "./model/navigation.js";
import "./styles.css";

const mode =
  new URLSearchParams(window.location.search).get("window") === "overlay"
    ? "overlay"
    : "command-center";

const root = document.querySelector("#root");
if (!root) throw new Error("Desktop application root was not found.");

const viewModel = createDesktopApp({
  host: createTauriDesktopHost(() => Promise.resolve()),
  mode: mode satisfies DesktopMode,
});

createRoot(root).render(
  <StrictMode>
    <App viewModel={viewModel} />
  </StrictMode>,
);
