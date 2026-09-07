import type {
  AttentionCandidate,
  AttentionSourceReaderPort,
  AttentionStore,
} from "../ports/attention.js";
import type { NotificationDeliveryPort } from "../ports/notification-delivery.js";
import { prepareAttentionCandidate } from "./attention-candidate.js";
import {
  claimAttentionDelivery,
  completeAttentionDelivery,
} from "./attention-delivery.js";
import {
  claimAttentionEvaluations,
  saveAttentionCandidates,
} from "./attention-evaluation.js";
import { compareAttentionRules } from "./attention-policy.js";
import { readAttentionCandidates } from "./attention-reads.js";

interface AttentionCycleOptions {
  store: AttentionStore;
  reader: AttentionSourceReaderPort;
  delivery?: NotificationDeliveryPort;
  clock: { now(): Date };
  reportFailure(error: unknown): void | Promise<void>;
  signal?: AbortSignal;
}

export async function processAttentionCycle(
  options: AttentionCycleOptions,
): Promise<void> {
  const { store, reader, delivery, clock, signal } = options;
  if (signal?.aborted) return;
  const now = clock.now();
  const rules = await claimAttentionEvaluations(store, now);
  const results = await readAttentionCandidates(rules, reader, now, signal);
  const work = results
    .flatMap((result) => result.rules.map((rule) => ({ rule, result })))
    .sort((a, b) => compareAttentionRules(a.rule, b.rule));
  for (const { rule, result } of work) {
    if (signal?.aborted) return;
    let candidates: AttentionCandidate[];
    try {
      if (!result.candidates) throw result.error;
      candidates = result.candidates
        .map((candidate) => ({
          ...prepareAttentionCandidate(candidate, rule, now),
          ...(candidate.presentation
            ? { presentation: candidate.presentation }
            : {}),
        }))
        .sort((a, b) => a.key.localeCompare(b.key));
    } catch (error) {
      await saveAttentionCandidates(store, rule, [], now, true);
      await report(error);
      continue;
    }
    const items = await saveAttentionCandidates(store, rule, candidates, now);
    for (const item of items) {
      if (signal?.aborted) return;
      const claimed = await claimAttentionDelivery(
        store,
        item,
        rule,
        clock.now(),
        !!delivery,
      );
      if (!claimed || !delivery) continue;
      try {
        await delivery.deliver(
          {
            id: claimed.id,
            text: claimed.text,
            spokenText: { timeZone: claimed.timeZone, dateStyle: "contextual" },
          },
          { ...(signal ? { shutdownSignal: signal } : {}) },
        );
        await completeAttentionDelivery(store, claimed, clock.now());
        await candidates
          .find((candidate) => candidate.key === claimed.key)
          ?.presentation?.record();
      } catch (error) {
        await report(error);
      }
    }
  }
  async function report(error: unknown): Promise<void> {
    try {
      await options.reportFailure(error);
    } catch {
      /* Reporting cannot change durable delivery state. */
    }
  }
}
