import type { AttentionState, AttentionStore } from "../ports/attention.js";

/** Retry only a known revision conflict, never a failed or uncertain write. */
export async function updateAttentionState<T>(
  store: AttentionStore,
  change: (state: AttentionState) => {
    readonly result: T;
    readonly state?: AttentionState;
  },
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await store.read();
    const update = change(current);
    if (!update.state) return update.result;
    if (
      await store.replace(current.revision, {
        ...update.state,
        revision: current.revision + 1,
      })
    )
      return update.result;
  }
  throw new Error(
    "Attention state changed repeatedly before the update could be saved.",
  );
}
