import { createTauriDesktopHost } from "./tauri-desktop-host.js";

function createDependencies(openedUrls: string[]) {
  return {
    autostartDisable: () => Promise.resolve(),
    autostartEnable: () => Promise.resolve(),
    autostartIsEnabled: () => Promise.resolve(false),
    isTauriRuntime: () => true,
    openExternalUrl: (url: string) => {
      openedUrls.push(url);
      return Promise.resolve();
    },
    registerGlobalShortcut: () => Promise.resolve(),
    restoreWindowState: () => Promise.resolve(),
    sendControl: () => Promise.resolve(),
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
});
