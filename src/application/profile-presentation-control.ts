import type { AssistantResponse } from "../ports/assistant.js";
import type { PresentationControl } from "../ports/presentation.js";
import type { ProfileStorePort } from "../ports/profile-store.js";
import { isProfileField, normalizeProfileValue } from "./profile-policy.js";

type ProfilePresentationControl = Extract<
  PresentationControl,
  { type: "profile_explain" | "profile_forget" | "profile_set" }
>;

export function createProfilePresentationControl(options: {
  readonly now: () => Date;
  readonly store: ProfileStorePort;
}): (control: ProfilePresentationControl) => Promise<AssistantResponse> {
  return async (control) => {
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
    if (control.type === "profile_forget") {
      const removed = await options.store.forget({
        field: control.field,
        ...(control.value ? { value: control.value } : {}),
      });
      return safeResponse(
        removed
          ? "I’ve removed that detail from your profile."
          : "That detail was not present in your profile.",
      );
    }
    const value = normalizeProfileValue(control.field, control.value, {
      now: options.now(),
    });
    await options.store.set({ field: control.field, value });
    return safeResponse("I’ve updated that profile detail.");
  };
}

function safeResponse(
  text: string,
  status: AssistantResponse["status"] = "ok",
): AssistantResponse {
  return { status, text };
}
