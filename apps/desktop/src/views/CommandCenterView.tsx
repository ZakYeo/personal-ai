import { ConnectionBadge } from "../components/ConnectionBadge.js";
import { SettingsPanel } from "../components/SettingsPanel.js";
import { ProfilePanel } from "../components/ProfilePanel.js";
import type { DesktopSection } from "../model/navigation.js";
import type { CommandCenterViewState } from "../view-models/desktop-view-state.js";
import { DashboardSectionView } from "./DashboardSectionView.js";

interface CommandCenterViewIntents {
  readonly applyShortcut: () => void;
  readonly openSource: (sourceId: string) => void;
  readonly correctProfileFact: (id: string, field: string) => void;
  readonly explainProfileFact: (field: string) => void;
  readonly forgetProfileFact: (field: string, value: string) => void;
  readonly selectSection: (section: DesktopSection) => void;
  readonly setAutostart: (enabled: boolean) => void;
  readonly submitRequest: () => void;
  readonly updateRequestDraft: (value: string) => void;
  readonly updateProfileDraft: (id: string, value: string) => void;
  readonly updateShortcutDraft: (value: string) => void;
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
        {state.section === "Settings" ? (
          <SettingsPanel
            autostartEnabled={state.autostartEnabled}
            onApplyShortcut={intents.applyShortcut}
            onAutostartChange={intents.setAutostart}
            onShortcutChange={intents.updateShortcutDraft}
            shortcutDraft={state.shortcutDraft}
          />
        ) : state.section === "Profile" ? (
          <ProfilePanel
            facts={state.profileFacts}
            onCorrect={intents.correctProfileFact}
            onDraftChange={intents.updateProfileDraft}
            onExplain={intents.explainProfileFact}
            onForget={intents.forgetProfileFact}
          />
        ) : (
          <DashboardSectionView
            onOpenSource={intents.openSource}
            state={state}
          />
        )}
        {state.controlMessage ? (
          <p className="control-message" role="status">
            {state.controlMessage}
          </p>
        ) : null}
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
