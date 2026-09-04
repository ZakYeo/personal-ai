import {
  emptyProjection,
  type DesktopPresentationState,
} from "../model/desktop-state.js";
import type { DesktopMode } from "../model/navigation.js";
import type { DesktopHost } from "../ports/desktop-host.js";
import type { PresentationClient } from "../ports/presentation-client.js";
import {
  createDesktopAppViewModel,
  type DesktopAppViewModel,
} from "../view-models/desktop-app-view-model.js";

export function createDesktopApp(options: {
  readonly host: DesktopHost;
  readonly initialState?: DesktopPresentationState;
  readonly mode: DesktopMode;
  readonly presentationClient?: PresentationClient;
}): DesktopAppViewModel {
  const viewModel = createDesktopAppViewModel({
    host: options.host,
    initialState: options.initialState ?? {
      connection: "offline",
      projection: emptyProjection,
    },
    mode: options.mode,
  });
  void options.host
    .initialize()
    .then(() => options.host.isAutostartEnabled())
    .then(viewModel.updateAutostartState)
    .catch(() => viewModel.updateRuntimeState({ connection: "offline" }));
  options.presentationClient?.subscribe((state) => {
    viewModel.updateRuntimeState(state);
    synchronizeOverlay(options, state);
  });
  options.presentationClient?.connect();
  return viewModel;
}

function synchronizeOverlay(
  options: Pick<Parameters<typeof createDesktopApp>[0], "host" | "mode">,
  state: Pick<DesktopPresentationState, "snapshot">,
): void {
  const phase = state.snapshot?.interaction?.phase;
  if (!phase) return;
  if (phase === "cancelled" || phase === "completed") {
    if (options.mode === "overlay") {
      void options.host.hideCurrentWindow().catch(() => {});
    }
    return;
  }
  void options.host.showOverlay().catch(() => {});
}
