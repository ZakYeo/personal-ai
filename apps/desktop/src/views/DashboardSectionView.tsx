import { DataCard } from "../components/DataCard.js";
import { EmptyState } from "../components/EmptyState.js";
import { SourceButtons } from "../components/SourceButtons.js";
import type { CommandCenterViewState } from "../view-models/desktop-view-state.js";

export function DashboardSectionView(properties: {
  readonly onOpenSource: (sourceId: string) => void;
  readonly state: CommandCenterViewState;
}) {
  if (properties.state.section === "Sources") {
    return (
      <section className="content-grid">
        <SourceButtons
          onOpen={properties.onOpenSource}
          sources={properties.state.sources}
        />
      </section>
    );
  }
  return (
    <section className="content-grid">
      {properties.state.cards.length === 0 ? (
        <EmptyState subject={properties.state.section} />
      ) : (
        properties.state.cards.map((card) => (
          <DataCard card={card} key={card.id} />
        ))
      )}
    </section>
  );
}
