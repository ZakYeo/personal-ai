import type { PresentationControl } from "../../../../src/presentation-contract.js";
import type { DesktopPresentationState } from "../model/desktop-state.js";
import type { DesktopMode, DesktopSection } from "../model/navigation.js";
import type { DesktopHost } from "../ports/desktop-host.js";
import { projectDesktopView, sourceById } from "./desktop-view-projection.js";
import type { DesktopAppViewState } from "./desktop-view-state.js";

export interface DesktopAppViewModel {
  readonly applyShortcut: () => void;
  readonly confirm: (interactionId: string) => void;
  readonly decline: (interactionId: string) => void;
  readonly dismissOverlay: () => void;
  readonly getSnapshot: () => DesktopAppViewState;
  readonly openSource: (sourceId: string) => void;
  readonly selectSection: (section: DesktopSection) => void;
  readonly setAutostart: (enabled: boolean) => void;
  readonly stopListening: () => void;
  readonly submitRequest: () => void;
  readonly subscribe: (listener: () => void) => () => void;
  readonly updateRequestDraft: (value: string) => void;
  readonly updateAutostartState: (enabled: boolean) => void;
  readonly updateShortcutDraft: (value: string) => void;
  readonly updateRuntimeState: (
    state: Pick<DesktopPresentationState, "connection" | "snapshot"> & {
      readonly projection?: DesktopPresentationState["projection"];
    },
  ) => void;
}

export function createDesktopAppViewModel(options: {
  readonly host: DesktopHost;
  readonly initialState: DesktopPresentationState;
  readonly mode: DesktopMode;
}): DesktopAppViewModel {
  let presentation = options.initialState;
  let autostartEnabled = false;
  let controlMessage: string | undefined;
  let requestDraft = "";
  let section: DesktopSection = "Today";
  let shortcutDraft = "CommandOrControl+Shift+Space";
  let snapshot = project();
  const listeners = new Set<() => void>();

  function project(): DesktopAppViewState {
    return projectDesktopView({
      autostartEnabled,
      ...(controlMessage ? { controlMessage } : {}),
      mode: options.mode,
      presentation,
      requestDraft,
      section,
      shortcutDraft,
    });
  }

  function update(mutator: () => void): void {
    mutator();
    snapshot = project();
    for (const listener of listeners) listener();
  }

  function dispatch(control: PresentationControl): void {
    update(() => (controlMessage = undefined));
    void options.host.sendControl(control).catch(() => {
      update(
        () =>
          (controlMessage =
            "The desktop service could not accept that request."),
      );
    });
  }

  const viewModel: DesktopAppViewModel = {
    applyShortcut: () => {
      void options.host
        .setPushToTalkShortcut(shortcutDraft.trim())
        .catch(showSafeControlFailure);
    },
    confirm: (interactionId) =>
      dispatch({ interactionId, requestId: requestId(), type: "confirm" }),
    decline: (interactionId) =>
      dispatch({ interactionId, requestId: requestId(), type: "decline" }),
    dismissOverlay: () => {
      void options.host.hideCurrentWindow().catch(showSafeControlFailure);
      dispatch({ requestId: requestId(), type: "dismiss_overlay" });
    },
    getSnapshot: () => snapshot,
    openSource: (sourceId) => {
      const source = sourceById(presentation, sourceId);
      if (source) void options.host.openSource(source.url);
    },
    selectSection: (nextSection) => update(() => (section = nextSection)),
    setAutostart: (enabled) => {
      update(() => (autostartEnabled = enabled));
      void options.host.setAutostart(enabled).catch(showSafeControlFailure);
    },
    stopListening: () =>
      dispatch({ requestId: requestId(), type: "stop_listening" }),
    submitRequest: () => {
      const text = requestDraft.trim();
      if (!text) return;
      dispatch({ requestId: requestId(), text, type: "submit_text" });
      update(() => (requestDraft = ""));
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    updateAutostartState: (enabled) =>
      update(() => (autostartEnabled = enabled)),
    updateRequestDraft: (value) => update(() => (requestDraft = value)),
    updateShortcutDraft: (value) => update(() => (shortcutDraft = value)),
    updateRuntimeState: (state) =>
      update(() => {
        presentation = {
          connection: state.connection,
          projection: state.projection ?? presentation.projection,
          ...(state.snapshot ? { snapshot: state.snapshot } : {}),
        };
      }),
  };
  return Object.freeze(viewModel);

  function showSafeControlFailure(): void {
    update(
      () =>
        (controlMessage = "The desktop window could not complete that action."),
    );
  }
}

let requestSequence = 0;
function requestId(): string {
  requestSequence += 1;
  return `desktop-${requestSequence}`;
}
