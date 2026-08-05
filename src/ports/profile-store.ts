export const profileFields = [
  "preferredName",
  "birthDate",
  "pronouns",
  "homeTimeZone",
  "homeLocation",
  "interest",
  "responseStyle",
] as const;

export type ProfileField = (typeof profileFields)[number];
export type ProfileResponseStyle = "balanced" | "concise" | "detailed";

export interface ProfileFact {
  createdAt: string;
  field: ProfileField;
  provenance: "user-authored";
  updatedAt: string;
  value: string;
}

export interface ProfileFactInput {
  field: ProfileField;
  value: string;
}

export interface ProfileFactSelector {
  field: ProfileField;
  value?: string;
}

export interface ProfileStorePort {
  clear(): Promise<ProfileFact[]>;
  forget(selector: ProfileFactSelector): Promise<ProfileFact | undefined>;
  list(): Promise<ProfileFact[]>;
  set(input: ProfileFactInput): Promise<ProfileFact>;
}
