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
  if (
    state.mode === "overlay" &&
    (state.overlay.phase === "cancelled" || state.overlay.phase === "completed")
  ) {
    return <main aria-label="Overlay dismissed" hidden />;
  }
  return state.mode === "overlay" ? (
    <OverlayView
      intents={{
        confirm: viewModel.confirm,
        decline: viewModel.decline,
        dismiss: viewModel.dismissOverlay,
        openSource: viewModel.openSource,
      }}
      state={state.overlay}
    />
  ) : (
    <CommandCenterView
      intents={{
        applyShortcut: viewModel.applyShortcut,
        correctProfileFact: viewModel.correctProfileFact,
        explainProfileFact: viewModel.explainProfileFact,
        forgetProfileFact: viewModel.forgetProfileFact,
        openSource: viewModel.openSource,
        selectSection: viewModel.selectSection,
        setAutostart: viewModel.setAutostart,
        submitRequest: viewModel.submitRequest,
        updateRequestDraft: viewModel.updateRequestDraft,
        updateProfileDraft: viewModel.updateProfileDraft,
        updateShortcutDraft: viewModel.updateShortcutDraft,
      }}
      state={state.commandCenter}
    />
  );
}
