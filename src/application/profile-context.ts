import type {
  AssistantPersonalizationReaderPort,
  PersonalContextReaderPort,
} from "../ports/personal-context.js";
import type { ProfileStorePort } from "../ports/profile-store.js";
import { isProfileResponseStyle } from "./profile-policy.js";

export function createProfileContextReaders(store: ProfileStorePort): {
  personalContext: PersonalContextReaderPort;
  personalization: AssistantPersonalizationReaderPort;
} {
  return {
    personalContext: {
      readHomeLocation: async () => {
        const value = (await store.list()).find(
          ({ field }) => field === "homeLocation",
        )?.value;
        return value
          ? Object.freeze({
              place: value,
              provenance: "user-authored" as const,
            })
          : undefined;
      },
    },
    personalization: {
      readAssistantPersonalization: async () => {
        const facts = await store.list();
        const preferredName = facts.find(
          ({ field }) => field === "preferredName",
        )?.value;
        const storedResponseStyle = facts.find(
          ({ field }) => field === "responseStyle",
        )?.value;
        const responseStyle =
          storedResponseStyle && isProfileResponseStyle(storedResponseStyle)
            ? storedResponseStyle
            : undefined;
        return Object.freeze({
          ...(preferredName ? { preferredName } : {}),
          ...(responseStyle ? { responseStyle } : {}),
        });
      },
    },
  };
}
