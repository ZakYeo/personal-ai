import type {
  AssistantPersonalizationReaderPort,
  PersonalContextReaderPort,
} from "../ports/personal-context.js";
import type { ProfileStorePort } from "../ports/profile-store.js";
import { defineRuntimeServiceToken } from "./runtime-service-registry.js";

export const assistantPersonalizationReaderService =
  defineRuntimeServiceToken<AssistantPersonalizationReaderPort>(
    "assistant personalization reader",
  );

export const personalContextReaderService =
  defineRuntimeServiceToken<PersonalContextReaderPort>(
    "personal context reader",
  );

export const profileStoreService = defineRuntimeServiceToken<ProfileStorePort>(
  "personal profile store",
);
