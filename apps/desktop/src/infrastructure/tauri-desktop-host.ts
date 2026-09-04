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
import type { PresentationControl } from "../../../../src/presentation-contract.js";
import type { DesktopHost } from "../ports/desktop-host.js";

interface TauriDesktopDependencies {
  readonly autostartDisable: () => Promise<void>;
  readonly autostartEnable: () => Promise<void>;
  readonly autostartIsEnabled: () => Promise<boolean>;
  readonly isTauriRuntime: () => boolean;
  readonly openExternalUrl: (url: string) => Promise<void>;
  readonly registerGlobalShortcut: (shortcut: string) => Promise<void>;
  readonly restoreWindowState: () => Promise<void>;
  readonly sendControl: (control: PresentationControl) => Promise<void>;
  readonly unregisterGlobalShortcuts: () => Promise<void>;
}

const noOperation = (): void => {};

export function createTauriDesktopHost(
  sendControl: (control: PresentationControl) => Promise<void>,
  dependencies: TauriDesktopDependencies = {
    autostartDisable: disableAutostart,
    autostartEnable: enableAutostart,
    autostartIsEnabled: isAutostartEnabled,
    isTauriRuntime: isTauri,
    openExternalUrl: openUrl,
    registerGlobalShortcut: (shortcut) =>
      registerShortcut(shortcut, noOperation),
    restoreWindowState: restoreStateCurrent,
    sendControl,
    unregisterGlobalShortcuts: unregisterShortcuts,
  },
): DesktopHost {
  const host: DesktopHost = {
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
      if (shortcut) await dependencies.registerGlobalShortcut(shortcut);
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
