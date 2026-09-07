export type ProcessingLocation = "local" | "remote" | "unchecked";

export interface FeatureAdapterInspection {
  readonly processing: readonly {
    readonly name: string;
    readonly location: ProcessingLocation;
  }[];
  readonly statePaths: readonly string[];
}
