import { useSyncExternalStore } from "react";
import type { DesktopAppViewModel } from "../view-models/desktop-app-view-model.js";
import { CommandCenterView } from "./CommandCenterView.js";
import { OverlayView } from "./OverlayView.js";

export function AppView({
  viewModel,
}: {
  readonly viewModel: DesktopAppViewModel;
}) {
  const state = useSyncExternalStore(
    viewModel.subscribe,
    viewModel.getSnapshot,
    viewModel.getSnapshot,
  );
  return state.mode === "overlay" ? (
    <OverlayView
      intents={{
        confirm: viewModel.confirm,
        decline: viewModel.decline,
        dismiss: viewModel.dismissOverlay,
        openSource: viewModel.openSource,
        stopListening: viewModel.stopListening,
      }}
      state={state.overlay}
    />
  ) : (
    <CommandCenterView
      intents={{
        openSource: viewModel.openSource,
        selectSection: viewModel.selectSection,
        submitRequest: viewModel.submitRequest,
        updateRequestDraft: viewModel.updateRequestDraft,
      }}
      state={state.commandCenter}
    />
  );
}
