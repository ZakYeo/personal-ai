export interface ExplicitHomeLocation {
  place: string;
  provenance: "user-authored";
}

export interface PersonalContextReaderPort {
  readHomeLocation(): Promise<ExplicitHomeLocation | undefined>;
}
