import { createTauriDesktopHost } from "./tauri-desktop-host.js";

function createDependencies(
  openedUrls: string[],
  shortcutHandlers: Array<() => void> = [],
  shownOverlays: string[] = [],
) {
  return {
    autostartDisable: () => Promise.resolve(),
    autostartEnable: () => Promise.resolve(),
    autostartIsEnabled: () => Promise.resolve(false),
    hideCurrentWindow: () => Promise.resolve(),
    isTauriRuntime: () => true,
    openExternalUrl: (url: string) => {
      openedUrls.push(url);
      return Promise.resolve();
    },
    registerGlobalShortcut: (_shortcut: string, onPressed: () => void) => {
      shortcutHandlers.push(onPressed);
      return Promise.resolve();
    },
    restoreWindowState: () => Promise.resolve(),
    sendControl: () => Promise.resolve(),
    showOverlayWindow: () => {
      shownOverlays.push("shown");
      return Promise.resolve();
    },
    unregisterGlobalShortcuts: () => Promise.resolve(),
  };
}

describe("Tauri desktop host", () => {
  it("opens only revalidated HTTPS source URLs", async () => {
    const openedUrls: string[] = [];
    const host = createTauriDesktopHost(
      () => Promise.resolve(),
      createDependencies(openedUrls),
    );

    await host.openSource("https://example.com/source");
    await expect(host.openSource("http://example.com/source")).rejects.toThrow(
      "Desktop sources must use HTTPS.",
    );

    expect(openedUrls).toEqual(["https://example.com/source"]);
  });

  it("keeps an updated push-to-talk shortcut connected to the overlay", async () => {
    const shortcutHandlers: Array<() => void> = [];
    const shownOverlays: string[] = [];
    const host = createTauriDesktopHost(
      () => Promise.resolve(),
      createDependencies([], shortcutHandlers, shownOverlays),
    );

    await host.setPushToTalkShortcut("Control+Space");
    shortcutHandlers[0]?.();
    await Promise.resolve();

    expect(shownOverlays).toEqual(["shown"]);
  });
});
