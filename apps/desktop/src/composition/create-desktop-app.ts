import { emptyProjection } from "../model/desktop-state.js";
import type { DesktopMode } from "../model/navigation.js";
import type { DesktopHost } from "../ports/desktop-host.js";
import {
  createDesktopAppViewModel,
  type DesktopAppViewModel,
} from "../view-models/desktop-app-view-model.js";

export function createDesktopApp(options: {
  readonly host: DesktopHost;
  readonly mode: DesktopMode;
}): DesktopAppViewModel {
  void options.host.initialize();
  return createDesktopAppViewModel({
    host: options.host,
    initialState: { connection: "offline", projection: emptyProjection },
    mode: options.mode,
  });
}
