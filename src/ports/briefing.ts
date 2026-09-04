import type {
  AssistantCitation,
  AssistantCommandParameters,
} from "./assistant.js";

export const briefingSections = [
  "profile",
  "calendar",
  "weather",
  "alarms",
  "tasks",
  "internet",
] as const;

export type BriefingSection = (typeof briefingSections)[number];
export type BriefingLength = "short" | "standard" | "attention-only";

export interface BriefingItem {
  readonly key: string;
  readonly text: string;
}

export interface BriefingSourceResult {
  readonly attention: readonly string[];
  readonly citations?: readonly AssistantCitation[];
  readonly facts: Readonly<AssistantCommandParameters>;
  readonly items: readonly BriefingItem[];
  readonly section: BriefingSection;
}

export interface BriefingSourceContext {
  readonly now: Date;
  readonly signal?: AbortSignal;
  readonly timeZone: string;
  readonly topic?: string;
}

export interface BriefingSourcePort {
  readonly section: BriefingSection;
  readonly read: (
    context: BriefingSourceContext,
  ) => Promise<BriefingSourceResult>;
}

export interface BriefingSnapshotSection {
  readonly available: boolean;
  readonly items: readonly BriefingItem[];
  readonly section: BriefingSection;
}

export interface BriefingSnapshot {
  readonly createdAt: string;
  readonly sections: readonly BriefingSnapshotSection[];
  readonly timeZone: string;
}

export type BriefingWeekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export const briefingWeekdays: readonly BriefingWeekday[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

export interface BriefingQuietHours {
  readonly end: string;
  readonly start: string;
}

export interface BriefingSchedule {
  readonly localTime: string;
  readonly timeZone: string;
  readonly weekdays: readonly BriefingWeekday[];
}

export interface BriefingPreferences {
  readonly length: BriefingLength;
  readonly quietHours?: BriefingQuietHours;
  readonly revision: number;
  readonly schedule?: BriefingSchedule;
  readonly searchTopics: readonly string[];
  readonly sections: readonly BriefingSection[];
  readonly updatedAt: string;
}

export interface BriefingPreferencesUpdate {
  readonly expectedRevision: number;
  readonly preferences: Omit<BriefingPreferences, "revision" | "updatedAt">;
  readonly updatedAt: string;
}

export interface BriefingDeliverySlot {
  readonly claimedAt: string;
  readonly deliveredAt?: string;
  readonly id: string;
  readonly status: "claimed" | "delivered" | "skipped";
}

export interface BriefingStore {
  readonly claimDeliverySlot: (slot: {
    readonly claimedAt: string;
    readonly id: string;
  }) => Promise<boolean>;
  readonly completeDeliverySlot: (completion: {
    readonly deliveredAt: string;
    readonly id: string;
    readonly snapshot: BriefingSnapshot;
  }) => Promise<boolean>;
  readonly getLastSnapshot: () => Promise<BriefingSnapshot | undefined>;
  readonly getPreferences: () => Promise<BriefingPreferences>;
  readonly saveSnapshot: (snapshot: BriefingSnapshot) => Promise<void>;
  readonly skipDeliverySlot: (slot: {
    readonly id: string;
    readonly skippedAt: string;
  }) => Promise<boolean>;
  readonly updatePreferences: (
    update: BriefingPreferencesUpdate,
  ) => Promise<BriefingPreferences | undefined>;
}

export interface DailyBriefingRequest {
  readonly length: BriefingLength;
  readonly sections: readonly BriefingSection[];
  readonly sinceLast: boolean;
  readonly timeZone: string;
  readonly topics?: readonly string[];
}

export interface DailyBriefingResult {
  readonly citations: readonly AssistantCitation[];
  readonly facts: Readonly<AssistantCommandParameters>;
  readonly snapshot: BriefingSnapshot;
  readonly text: string;
  readonly usedInternet: boolean;
}

export interface DailyBriefingContext {
  readonly lastSnapshot?: BriefingSnapshot;
  readonly now: Date;
  readonly reportDiagnostic: (error: unknown) => void;
  readonly signal?: AbortSignal;
}

export interface DailyBriefingAggregatorPort {
  readonly create: (
    request: DailyBriefingRequest,
    context: DailyBriefingContext,
  ) => Promise<DailyBriefingResult>;
}
