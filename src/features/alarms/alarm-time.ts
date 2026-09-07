import type {
  AssistantContext,
  AssistantResponse,
} from "../../ports/assistant.js";
import { isCanonicalIsoTimestamp } from "../../application/temporal-policy.js";

interface AlarmTimeInput {
  minutesFromNow?: number;
  scheduledFor?: string;
}

export function requestAlarmTimeClarification(
  args: AlarmTimeInput,
): AssistantResponse | undefined {
  if (args.minutesFromNow === undefined && args.scheduledFor === undefined)
    return { status: "ok", text: "What time should I use for the alarm?" };
}

export function resolveAlarmTime(
  args: AlarmTimeInput,
  context: AssistantContext,
): string {
  if ((args.minutesFromNow === undefined) === (args.scheduledFor === undefined))
    throw new Error(
      "Specify exactly one relative delay or absolute alarm time.",
    );
  const now = context.clock.now().getTime();
  if (
    args.minutesFromNow !== undefined &&
    (!Number.isFinite(args.minutesFromNow) || args.minutesFromNow <= 0)
  )
    throw new Error("The alarm delay must be finite and positive.");
  const scheduledFor =
    args.scheduledFor ??
    new Date(now + args.minutesFromNow! * 60_000).toISOString();
  if (
    !isCanonicalIsoTimestamp(scheduledFor) ||
    !Number.isFinite(now) ||
    Date.parse(scheduledFor) <= now
  )
    throw new Error("The alarm time must be a valid future UTC instant.");
  return scheduledFor;
}

export function prepareAlarmTime<T extends AlarmTimeInput>(
  args: T,
  context: AssistantContext,
): Omit<T, "minutesFromNow"> & { scheduledFor: string } {
  const prepared = { ...args, scheduledFor: resolveAlarmTime(args, context) };
  delete prepared.minutesFromNow;
  return prepared;
}
