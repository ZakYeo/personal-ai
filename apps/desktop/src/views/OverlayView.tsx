import { ConnectionBadge } from "../components/ConnectionBadge.js";
import { SourceButtons } from "../components/SourceButtons.js";
import type { OverlayViewState } from "../view-models/desktop-view-state.js";

interface OverlayViewIntents {
  readonly confirm: (interactionId: string) => void;
  readonly decline: (interactionId: string) => void;
  readonly dismiss: () => void;
  readonly openSource: (sourceId: string) => void;
}

export function OverlayView(properties: {
  readonly intents: OverlayViewIntents;
  readonly state: OverlayViewState;
}) {
  const { intents, state } = properties;
  const confirmation = state.confirmation;
  return (
    <main className="overlay-shell" aria-live="polite">
      <div className="ambient-line" />
      <header className="overlay-header">
        <span
          className={`status-orb status-${state.phase}`}
          aria-hidden="true"
        />
        <div>
          <p className="eyebrow">Jarvis</p>
          <h1>{state.title}</h1>
        </div>
        <span className="privacy-state">{state.microphoneLabel}</span>
      </header>
      {state.transcript ? (
        <p className="transcript">“{state.transcript}”</p>
      ) : null}
      {confirmation ? (
        <section className="confirmation-panel">
          <p>{confirmation.prompt}</p>
          <div className="button-row">
            <button
              className="primary"
              onClick={() => intents.confirm(confirmation.interactionId)}
            >
              Confirm
            </button>
            <button onClick={() => intents.decline(confirmation.interactionId)}>
              Decline
            </button>
          </div>
        </section>
      ) : null}
      {state.response ? (
        <section className="response-panel">
          <p>{state.response}</p>
          <SourceButtons onOpen={intents.openSource} sources={state.sources} />
        </section>
      ) : null}
      {state.failure ? (
        <p className="failure-message">{state.failure}</p>
      ) : null}
      {state.controlMessage ? (
        <p className="failure-message" role="status">
          {state.controlMessage}
        </p>
      ) : null}
      <footer className="overlay-footer">
        <ConnectionBadge
          label={state.connectionLabel}
          state={state.connectionState}
        />
        {state.phase === "listening" ? (
          <small className="deferred-control">
            Voice stop arrives with interruption support.
          </small>
        ) : null}
        <button className="quiet-button" onClick={intents.dismiss}>
          Hide
        </button>
      </footer>
    </main>
  );
}
