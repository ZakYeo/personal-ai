import type { SourceViewState } from "../view-models/desktop-view-state.js";

export function SourceButtons(properties: {
  readonly onOpen: (sourceId: string) => void;
  readonly sources: readonly SourceViewState[];
}) {
  if (properties.sources.length === 0) return null;
  return (
    <div className="source-list">
      {properties.sources.map((source) => (
        <button key={source.id} onClick={() => properties.onOpen(source.id)}>
          {source.title}
        </button>
      ))}
    </div>
  );
}
