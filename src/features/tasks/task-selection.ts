import {
  type FeatureArgsFromParameters,
  type FeatureCapabilityParameters,
  type FeatureExecutionContext,
  type FeatureResult,
} from "../../ports/feature.js";
import {
  normalizeTaskLabel,
  normalizeTaskListName,
} from "../../ports/task-policy.js";
import type {
  TaskListRecord,
  TaskRecord,
  TaskStore,
} from "../../ports/task-store.js";

export const taskTargetParameters = {
  id: { type: "string" },
  label: { type: "string" },
  listName: { type: "string" },
  ordinal: { type: "number" },
  reference: { type: "string" },
} as const satisfies FeatureCapabilityParameters;

export type TaskTargetArgs = FeatureArgsFromParameters<
  typeof taskTargetParameters
>;

type TaskSelection =
  | { list: TaskListRecord; task: TaskRecord }
  | { result: FeatureResult };

interface TaskEligibility {
  matches(task: TaskRecord): boolean;
  noMatchText: string;
}

export async function selectEligibleTask(
  store: TaskStore,
  args: TaskTargetArgs,
  context: FeatureExecutionContext,
  eligibleStatuses: readonly TaskRecord["status"][],
  eligibility?: TaskEligibility,
): Promise<TaskSelection> {
  const [lists, tasks] = await Promise.all([
    store.listLists(),
    store.listTasks(),
  ]);
  const referenced = selectReferencedTask(args, context);
  if (referenced) {
    const task = tasks.find((candidate) => candidate.id === referenced.taskId);
    if (
      !task ||
      task.listId !== referenced.listId ||
      task.revision !== referenced.revision
    ) {
      return {
        result: {
          text: "That task changed after I showed it to you. Please show the list again.",
        },
      };
    }
    const list = lists.find((candidate) => candidate.id === task.listId);
    if (!list || list.revision !== referenced.listRevision) {
      return {
        result: {
          text: "That task changed after I showed it to you. Please show the list again.",
        },
      };
    }
    if (
      !eligibleStatuses.includes(task.status) ||
      (eligibility && !eligibility.matches(task))
    ) {
      return {
        result: ineligibleTaskResult(
          eligibleStatuses,
          eligibility?.noMatchText,
        ),
      };
    }
    return { list, task };
  }

  const requestedList = args.listName
    ? selectTaskList(lists, normalizeTaskListName(args.listName))
    : undefined;
  if (args.listName && !requestedList) {
    return {
      result: {
        text: `I could not find a list named ${normalizeTaskListName(
          args.listName,
        )}.`,
      },
    };
  }
  const label = args.label
    ? normalizeTaskLabel(args.label).toLocaleLowerCase("en")
    : undefined;
  const eligible = tasks.filter(
    (task) =>
      eligibleStatuses.includes(task.status) &&
      (eligibility === undefined || eligibility.matches(task)) &&
      (args.id === undefined || task.id === args.id) &&
      (requestedList === undefined || task.listId === requestedList.id) &&
      (label === undefined || task.label.toLocaleLowerCase("en") === label),
  );
  if (eligible.length !== 1) {
    return {
      result:
        eligible.length === 0
          ? ineligibleTaskResult(eligibleStatuses, eligibility?.noMatchText)
          : {
              expectsFollowUp: true,
              text: "More than one eligible task matches. Please name its list or show the list and choose an item.",
            },
    };
  }
  const task = eligible[0]!;
  const list = lists.find((candidate) => candidate.id === task.listId);
  if (!list) throw new Error("Task state refers to an unknown list.");
  return { list, task };
}

export function selectTaskList(
  lists: readonly TaskListRecord[],
  name: string,
): TaskListRecord | undefined {
  const canonicalName = name.toLocaleLowerCase("en");
  return lists.find(
    (list) => list.name.toLocaleLowerCase("en") === canonicalName,
  );
}

function selectReferencedTask(
  args: TaskTargetArgs,
  context: FeatureExecutionContext,
) {
  if (
    args.ordinal === undefined &&
    args.reference === undefined &&
    (args.id !== undefined ||
      args.label !== undefined ||
      args.listName !== undefined)
  ) {
    return;
  }
  const selected = context.selectResultReference?.({
    ...(args.ordinal === undefined ? {} : { ordinal: args.ordinal }),
    rawText: context.trustedInputText ?? "",
    ...(args.reference === undefined ? {} : { reference: args.reference }),
  });
  return selected?.target?.kind === "task_item" ? selected.target : undefined;
}

function ineligibleTaskResult(
  eligibleStatuses: readonly TaskRecord["status"][],
  customText?: string,
): FeatureResult {
  if (customText) return { text: customText };
  return {
    text:
      eligibleStatuses.length > 1
        ? "I could not find one matching task."
        : eligibleStatuses[0] === "open"
          ? "I could not find one matching open task to complete."
          : "I could not find one matching completed task to reopen.",
  };
}
