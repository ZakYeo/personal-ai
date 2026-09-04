import type { DesktopHost } from "../ports/desktop-host.js";

export const offlineDesktopHost: DesktopHost = Object.freeze({
  openSource: () => Promise.resolve(),
  sendControl: () => Promise.resolve(),
});
