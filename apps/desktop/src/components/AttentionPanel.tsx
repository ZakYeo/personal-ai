import type {
  AttentionNoticeAction,
  AttentionNoticeViewState,
} from "../view-models/desktop-view-state.js";
import { EmptyState } from "./EmptyState.js";

export function AttentionPanel(properties: {
  readonly notices: readonly AttentionNoticeViewState[];
  readonly onUpdate: (
    id: string,
    expectedRevision: number,
    action: AttentionNoticeAction,
  ) => void;
}) {
  return (
    <section className="attention-panel" aria-label="Attention inbox">
      <p className="privacy-note">
        Notices come from rules you explicitly enable. A delivered notice still
        needs your acknowledgement.
      </p>
      {properties.notices.length === 0 ? (
        <EmptyState subject="Inbox" />
      ) : (
        properties.notices.map((notice) => (
          <article className="data-card" key={notice.id}>
            <h2>{notice.title}</h2>
            <small>
              Recorded {notice.recordedAt} · {notice.status} · Delivery{" "}
              {notice.delivery}
            </small>
            <p>{notice.text}</p>
            <details>
              <summary>Why this notice?</summary>
              <p>{notice.explanation}</p>
              <p>{notice.provenance}</p>
            </details>
            <div className="button-row attention-actions">
              <button
                onClick={() =>
                  properties.onUpdate(notice.id, notice.revision, "acknowledge")
                }
              >
                Acknowledge notice
              </button>
              <button
                onClick={() =>
                  properties.onUpdate(notice.id, notice.revision, "snooze")
                }
              >
                Snooze one hour
              </button>
              <button
                onClick={() =>
                  properties.onUpdate(notice.id, notice.revision, "dismiss")
                }
              >
                Dismiss
              </button>
              <button
                onClick={() =>
                  properties.onUpdate(
                    notice.id,
                    notice.revision,
                    "disable_rule",
                  )
                }
              >
                Do not tell me again
              </button>
              {notice.canResolveReminder ? (
                <button
                  onClick={() =>
                    properties.onUpdate(
                      notice.id,
                      notice.revision,
                      "resolve_reminder",
                    )
                  }
                >
                  Acknowledge reminder without completing task
                </button>
              ) : null}
            </div>
          </article>
        ))
      )}
    </section>
  );
}
