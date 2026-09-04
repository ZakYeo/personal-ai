import type { PresentationControl } from "../../../../src/presentation-contract.js";
import type { DesktopPresentationState } from "../model/desktop-state.js";
import type { DesktopMode, DesktopSection } from "../model/navigation.js";
import type { DesktopHost } from "../ports/desktop-host.js";
import {
  profileFactId,
  projectDesktopView,
  sourceById,
} from "./desktop-view-projection.js";
import type { DesktopAppViewState } from "./desktop-view-state.js";

export interface DesktopAppViewModel {
  readonly applyShortcut: () => void;
  readonly confirm: (interactionId: string) => void;
  readonly decline: (interactionId: string) => void;
  readonly dismissOverlay: () => void;
  readonly getSnapshot: () => DesktopAppViewState;
  readonly openSource: (sourceId: string) => void;
  readonly correctProfileFact: (id: string, field: string) => void;
  readonly explainProfileFact: (field: string) => void;
  readonly forgetProfileFact: (field: string, value: string) => void;
  readonly selectSection: (section: DesktopSection) => void;
  readonly setAutostart: (enabled: boolean) => void;
  readonly submitRequest: () => void;
  readonly subscribe: (listener: () => void) => () => void;
  readonly updateRequestDraft: (value: string) => void;
  readonly updateProfileDraft: (id: string, value: string) => void;
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
  const profileDrafts = new Map<string, string>();
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
      profileDrafts,
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
    dispatchPresentationControl(options.host, control, (message) =>
      update(() => (controlMessage = message)),
    );
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
    correctProfileFact: (id, field) => {
      const value = profileDrafts.get(id)?.trim();
      if (!value) return;
      dispatch({ field, requestId: requestId(), type: "profile_set", value });
    },
    dismissOverlay: () => {
      void options.host.hideCurrentWindow().catch(showSafeControlFailure);
      dispatch({ requestId: requestId(), type: "dismiss_overlay" });
    },
    getSnapshot: () => snapshot,
    explainProfileFact: (field) =>
      dispatch({ field, requestId: requestId(), type: "profile_explain" }),
    forgetProfileFact: (field, value) =>
      dispatch({
        field,
        requestId: requestId(),
        type: "profile_forget",
        value,
      }),
    openSource: (sourceId) => {
      const source = sourceById(presentation, sourceId);
      if (source) void options.host.openSource(source.url);
    },
    selectSection: (nextSection) => update(() => (section = nextSection)),
    setAutostart: (enabled) => {
      update(() => (autostartEnabled = enabled));
      void options.host.setAutostart(enabled).catch(showSafeControlFailure);
    },
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
    updateProfileDraft: (id, value) =>
      update(() => profileDrafts.set(id, value)),
    updateRequestDraft: (value) => update(() => (requestDraft = value)),
    updateShortcutDraft: (value) => update(() => (shortcutDraft = value)),
    updateRuntimeState: (state) =>
      update(() => {
        presentation = {
          connection: state.connection,
          projection: state.projection ?? presentation.projection,
          ...(state.snapshot ? { snapshot: state.snapshot } : {}),
        };
        for (const [index, fact] of presentation.projection.profile.entries()) {
          const id = profileFactId(fact.field, fact.value, index);
          if (!profileDrafts.has(id)) profileDrafts.set(id, fact.value);
        }
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

function dispatchPresentationControl(
  host: DesktopHost,
  control: PresentationControl,
  showMessage: (message: string) => void,
): void {
  void host
    .sendControl(control)
    .then((result) => {
      if (result.status === "accepted") return;
      showMessage(
        result.message ?? "The desktop service could not accept that request.",
      );
    })
    .catch(() =>
      showMessage("The desktop service could not accept that request."),
    );
}

let requestSequence = 0;
function requestId(): string {
  requestSequence += 1;
  return `desktop-${requestSequence}`;
}
