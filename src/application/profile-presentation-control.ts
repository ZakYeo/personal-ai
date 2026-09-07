import {
  buildAssistantPresentationProjection,
  emptyAssistantPresentationProjection,
} from "./presentation-projection.js";
import type {
  PresentationProfileItem,
  PresentationControl,
} from "../ports/presentation.js";
import type { AssistantResponse } from "../ports/assistant.js";
import type { ProfileFact, ProfileStorePort } from "../ports/profile-store.js";
import { isProfileField, normalizeProfileValue } from "./profile-policy.js";

type ProfilePresentationControl = Extract<
  PresentationControl,
  { type: "profile_explain" | "profile_forget" | "profile_set" }
>;

export function createProfilePresentationControl(options: {
  readonly now: () => Date;
  readonly store: ProfileStorePort;
  readonly referencePrefix: string;
}) {
  let sequence = 0;
  let selected = new Map<string, { fact: ProfileFact; display: string }>();
  return { project, handle };

  function project(
    facts: readonly ProfileFact[],
  ): readonly PresentationProfileItem[] {
    const next = new Map<string, { fact: ProfileFact; display: string }>();
    const profile = facts.slice(0, 50).map((fact) => {
      const reference =
        [...selected].find(([, item]) => sameFact(item.fact, fact))?.[0] ??
        `${options.referencePrefix}-profile-${++sequence}`;
      next.set(reference, { fact: { ...fact }, display: fact.value });
      return {
        field: fact.field,
        reference,
        provenance: fact.provenance,
        value: fact.value,
      };
    });
    const projection = buildAssistantPresentationProjection(
      { ...emptyAssistantPresentationProjection, profile },
      { now: options.now(), timeZone: "UTC" },
    ).profile;
    for (const item of projection) {
      const stored = next.get(item.reference);
      if (stored) stored.display = item.value;
    }
    selected = next;
    return projection;
  }

  async function handle(
    control: ProfilePresentationControl,
  ): Promise<AssistantResponse> {
    if (!isProfileField(control.field)) {
      return safeResponse("That profile field is not supported.", "invalid");
    }
    if (control.type === "profile_explain") {
      const fact = (await options.store.list()).find(
        (candidate) => candidate.field === control.field,
      );
      return safeResponse(
        fact
          ? "That detail is stored because you explicitly asked me to remember it."
          : "That detail is not currently stored in your profile.",
      );
    }
    const selection = selected.get(control.reference);
    if (
      !selection ||
      selection.fact.field !== control.field ||
      !(await options.store.list()).some((fact) =>
        sameFact(fact, selection.fact),
      )
    ) {
      return safeResponse(
        "That profile selection has changed. Please refresh it.",
        "invalid",
      );
    }
    if (control.type === "profile_forget") {
      const removed = await options.store.forget({
        field: control.field,
        value: selection.fact.value,
      });
      return safeResponse(
        removed
          ? "I’ve removed that detail from your profile."
          : "That detail was not present in your profile.",
      );
    }
    if (control.value === selection.display)
      return safeResponse("That profile detail is unchanged.");
    const value = normalizeProfileValue(control.field, control.value, {
      now: options.now(),
    });
    await options.store.set({ field: control.field, value });
    return safeResponse("I’ve updated that profile detail.");
  }
}

function sameFact(first: ProfileFact, second: ProfileFact): boolean {
  return (
    first.field === second.field &&
    first.value === second.value &&
    first.createdAt === second.createdAt &&
    first.updatedAt === second.updatedAt
  );
}

function safeResponse(
  text: string,
  status: AssistantResponse["status"] = "ok",
): AssistantResponse {
  return { status, text };
}
