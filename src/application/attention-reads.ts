import type {
  AttentionCandidate,
  AttentionRule,
  AttentionSourceReaderPort,
} from "../ports/attention.js";

type AttentionReadResult = {
  readonly rules: readonly AttentionRule[];
} & (
  | {
      readonly candidates: readonly AttentionCandidate[];
      readonly error?: never;
    }
  | { readonly error: unknown; readonly candidates?: never }
);

/** Identical normalized requests share one read; providers receive no rule provenance or controls. */
export async function readAttentionCandidates(
  rules: readonly AttentionRule[],
  reader: AttentionSourceReaderPort,
  now: Date,
  signal?: AbortSignal,
): Promise<AttentionReadResult[]> {
  const grouped = new Map<string, AttentionRule[]>();
  for (const rule of rules) {
    const key = JSON.stringify([rule.definition, rule.timeZone]);
    const group = grouped.get(key);
    if (group) group.push(rule);
    else grouped.set(key, [rule]);
  }
  const groups = [...grouped.values()];
  const results: AttentionReadResult[] = [];
  const regular = groups.filter(
    ([rule]) => rule!.definition.kind !== "morning_routine",
  );
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, regular.length) }, async () => {
      while (next < regular.length && !signal?.aborted)
        await readGroup(regular[next++]!);
    }),
  );
  // The fixed morning aggregator owns up to four independent source reads itself.
  for (const group of groups.filter(
    ([rule]) => rule!.definition.kind === "morning_routine",
  )) {
    if (signal?.aborted) break;
    await readGroup(group);
  }
  return results;

  async function readGroup(group: readonly AttentionRule[]): Promise<void> {
    try {
      const rule = group[0]!;
      const candidates = await reader.read(
        {
          definition: structuredClone(rule.definition),
          timeZone: rule.timeZone,
        },
        { now: new Date(now.getTime()), ...(signal ? { signal } : {}) },
      );
      if (!Array.isArray(candidates) || candidates.length > 10)
        throw new Error("Attention source exceeded its candidate bound.");
      results.push({ rules: group, candidates });
    } catch (error) {
      results.push({ rules: group, error });
    }
  }
}
