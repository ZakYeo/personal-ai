import type { CardViewState } from "../view-models/desktop-view-state.js";

export function DataCard({ card }: { readonly card: CardViewState }) {
  return (
    <article className="data-card">
      <h2>{card.title}</h2>
      <p>{card.detail}</p>
    </article>
  );
}
