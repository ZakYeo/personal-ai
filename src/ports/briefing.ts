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
type BriefingLength = "short" | "standard" | "attention-only";

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

interface BriefingSnapshot {
  readonly createdAt: string;
  readonly sections: readonly BriefingSnapshotSection[];
  readonly timeZone: string;
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
