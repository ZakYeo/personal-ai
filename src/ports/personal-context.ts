export interface ExplicitHomeLocation {
  place: string;
  provenance: "user-authored";
}

export interface PersonalContextReaderPort {
  readHomeLocation(): Promise<ExplicitHomeLocation | undefined>;
}

export type AssistantResponseStyle = "balanced" | "concise" | "detailed";

export interface AssistantPersonalization {
  readonly preferredName?: string;
  readonly responseStyle?: AssistantResponseStyle;
}

export interface AssistantPersonalizationReaderPort {
  readAssistantPersonalization(): Promise<AssistantPersonalization>;
}
