import type { ProfileFactViewState } from "../view-models/desktop-view-state.js";

export function ProfilePanel(properties: {
  readonly facts: readonly ProfileFactViewState[];
  readonly onCorrect: (id: string, field: string) => void;
  readonly onDraftChange: (id: string, value: string) => void;
  readonly onExplain: (field: string) => void;
  readonly onForget: (field: string, value: string) => void;
}) {
  return (
    <section className="profile-panel" aria-label="Profile controls">
      {properties.facts.map((fact) => (
        <article className="profile-fact" key={fact.id}>
          <label htmlFor={`profile-${fact.id}`}>{fact.label}</label>
          <small>{fact.provenance}</small>
          <input
            id={`profile-${fact.id}`}
            maxLength={1_000}
            onChange={(event) =>
              properties.onDraftChange(fact.id, event.target.value)
            }
            value={fact.draft}
          />
          <div className="button-row">
            <button onClick={() => properties.onCorrect(fact.id, fact.field)}>
              Save correction
            </button>
            <button onClick={() => properties.onExplain(fact.field)}>
              Why is this saved?
            </button>
            <button onClick={() => properties.onForget(fact.field, fact.value)}>
              Forget
            </button>
          </div>
        </article>
      ))}
    </section>
  );
}
