import { ConnectionBadge } from "../components/ConnectionBadge.js";
import type { DesktopSection } from "../model/navigation.js";
import type { CommandCenterViewState } from "../view-models/desktop-view-state.js";
import { DashboardSectionView } from "./DashboardSectionView.js";

interface CommandCenterViewIntents {
  readonly openSource: (sourceId: string) => void;
  readonly selectSection: (section: DesktopSection) => void;
  readonly submitRequest: () => void;
  readonly updateRequestDraft: (value: string) => void;
}

export function CommandCenterView(properties: {
  readonly intents: CommandCenterViewIntents;
  readonly state: CommandCenterViewState;
}) {
  const { intents, state } = properties;
  return (
    <main className="command-center">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">J</span>
          <div>
            <strong>Jarvis</strong>
            <small>Personal command center</small>
          </div>
        </div>
        <nav aria-label="Command center">
          {state.sections.map((item) => (
            <button
              aria-current={state.section === item ? "page" : undefined}
              className={state.section === item ? "active" : ""}
              key={item}
              onClick={() => intents.selectSection(item)}
            >
              {item}
            </button>
          ))}
        </nav>
        <ConnectionBadge
          label={state.connectionLabel}
          state={state.connectionState}
        />
      </aside>
      <section className="workspace">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">Command center</p>
            <h1>{state.section}</h1>
          </div>
          <span className="privacy-state">{state.microphoneLabel}</span>
        </header>
        <DashboardSectionView onOpenSource={intents.openSource} state={state} />
        <form
          className="ask-bar"
          onSubmit={(event) => {
            event.preventDefault();
            intents.submitRequest();
          }}
        >
          <label htmlFor="assistant-request">Ask Jarvis</label>
          <div>
            <input
              id="assistant-request"
              maxLength={16_000}
              onChange={(event) =>
                intents.updateRequestDraft(event.target.value)
              }
              placeholder="Type a request…"
              value={state.requestDraft}
            />
            <button className="primary" type="submit">
              Send
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
