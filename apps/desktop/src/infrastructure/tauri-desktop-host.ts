import { isTauri } from "@tauri-apps/api/core";
import {
  disable as disableAutostart,
  enable as enableAutostart,
  isEnabled as isAutostartEnabled,
} from "@tauri-apps/plugin-autostart";
import {
  register as registerShortcut,
  unregisterAll as unregisterShortcuts,
} from "@tauri-apps/plugin-global-shortcut";
import { openUrl } from "@tauri-apps/plugin-opener";
import { restoreStateCurrent } from "@tauri-apps/plugin-window-state";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type {
  PresentationControl,
  PresentationControlResult,
} from "../../../../src/presentation-contract.js";
import type { DesktopHost } from "../ports/desktop-host.js";

interface TauriDesktopDependencies {
  readonly autostartDisable: () => Promise<void>;
  readonly autostartEnable: () => Promise<void>;
  readonly autostartIsEnabled: () => Promise<boolean>;
  readonly isTauriRuntime: () => boolean;
  readonly hideCurrentWindow: () => Promise<void>;
  readonly openExternalUrl: (url: string) => Promise<void>;
  readonly registerGlobalShortcut: (
    shortcut: string,
    onPressed: () => void,
  ) => Promise<void>;
  readonly restoreWindowState: () => Promise<void>;
  readonly sendControl: (
    control: PresentationControl,
  ) => Promise<PresentationControlResult>;
  readonly showOverlayWindow: () => Promise<void>;
  readonly unregisterGlobalShortcuts: () => Promise<void>;
}

async function showOverlayWindow(): Promise<void> {
  const overlay = await WebviewWindow.getByLabel("overlay");
  await overlay?.show();
  await overlay?.setFocus();
}

export function createTauriDesktopHost(
  sendControl: (
    control: PresentationControl,
  ) => Promise<PresentationControlResult>,
  dependencies: TauriDesktopDependencies = {
    autostartDisable: disableAutostart,
    autostartEnable: enableAutostart,
    autostartIsEnabled: isAutostartEnabled,
    isTauriRuntime: isTauri,
    hideCurrentWindow: () => getCurrentWindow().hide(),
    openExternalUrl: openUrl,
    registerGlobalShortcut: registerShortcut,
    restoreWindowState: restoreStateCurrent,
    sendControl,
    showOverlayWindow,
    unregisterGlobalShortcuts: unregisterShortcuts,
  },
): DesktopHost {
  const host: DesktopHost = {
    hideCurrentWindow: async () => {
      if (dependencies.isTauriRuntime()) {
        await dependencies.hideCurrentWindow();
      }
    },
    initialize: async () => {
      if (dependencies.isTauriRuntime())
        await dependencies.restoreWindowState();
    },
    isAutostartEnabled: () =>
      dependencies.isTauriRuntime()
        ? dependencies.autostartIsEnabled()
        : Promise.resolve(false),
    openSource: async (url) => {
      const validatedUrl = validateExternalSourceUrl(url);
      if (!dependencies.isTauriRuntime()) return;
      await dependencies.openExternalUrl(validatedUrl);
    },
    sendControl: dependencies.sendControl,
    setAutostart: async (enabled) => {
      if (!dependencies.isTauriRuntime()) return;
      await (enabled
        ? dependencies.autostartEnable()
        : dependencies.autostartDisable());
    },
    setPushToTalkShortcut: async (shortcut) => {
      if (!dependencies.isTauriRuntime()) return;
      await dependencies.unregisterGlobalShortcuts();
      if (shortcut)
        await dependencies.registerGlobalShortcut(shortcut, () => {
          void dependencies.showOverlayWindow();
        });
    },
    showOverlay: async () => {
      if (dependencies.isTauriRuntime()) {
        await dependencies.showOverlayWindow();
      }
    },
  };
  return Object.freeze(host);
}

function validateExternalSourceUrl(value: string): string {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:") {
    throw new Error("Desktop sources must use HTTPS.");
  }
  return parsed.toString();
}
