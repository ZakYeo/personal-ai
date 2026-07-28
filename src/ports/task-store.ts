export interface TaskListRecord {
  createdAt: string;
  id: string;
  name: string;
  revision: number;
  updatedAt: string;
}

export type TaskStatus = "completed" | "open";

export type TaskReminder =
  | {
      scheduledFor: string;
      status: "scheduled";
    }
  | {
      claimedAt: string;
      scheduledFor: string;
      status: "claimed";
    }
  | {
      claimedAt: string;
      deliveredAt: string;
      scheduledFor: string;
      status: "delivered";
    }
  | {
      acknowledgedAt: string;
      claimedAt: string;
      deliveredAt?: string;
      scheduledFor: string;
      status: "acknowledged";
    }
  | {
      cancelledAt: string;
      scheduledFor: string;
      status: "cancelled";
    };

export interface TaskRecord {
  completedAt?: string;
  createdAt: string;
  dueDate?: string;
  id: string;
  label: string;
  listId: string;
  note?: string;
  reminder?: TaskReminder;
  revision: number;
  status: TaskStatus;
  updatedAt: string;
}

export type NewTaskList = Pick<TaskListRecord, "name">;

export interface NewTask {
  dueDate?: string;
  label: string;
  listId: string;
  note?: string;
  reminderAt?: string;
}

export interface RenameTaskListRequest {
  expectedRevision: number;
  id: string;
  name: string;
  updatedAt: string;
}

export interface RemoveTaskRequest {
  expectedRevision: number;
  id: string;
}

export interface ClearTaskListRequest {
  expectedListRevision: number;
  listId: string;
  tasks: Array<{
    id: string;
    revision: number;
  }>;
}

export interface ClearTaskListResult {
  list: TaskListRecord;
  removed: TaskRecord[];
}

export interface ClaimTaskReminderRequest {
  claimedAt: string;
  expectedRevision: number;
  id: string;
}

export interface DeliverTaskReminderRequest {
  deliveredAt: string;
  expectedRevision: number;
  id: string;
}

export interface AcknowledgeTaskReminderRequest {
  acknowledgedAt: string;
  expectedRevision: number;
  id: string;
}

export interface ClearTerminalTaskRemindersRequest {
  cutoff: string;
  updatedAt: string;
}

export interface UpdateTaskRequest {
  changes: {
    dueDate?: null | string;
    label?: string;
    note?: null | string;
    reminderAt?: null | string;
    status?: TaskStatus;
  };
  expectedRevision: number;
  id: string;
  updatedAt: string;
}

export interface TaskStore {
  acknowledgeReminder(
    request: AcknowledgeTaskReminderRequest,
  ): Promise<TaskRecord | undefined>;
  addList(list: NewTaskList): Promise<TaskListRecord>;
  addTask(task: NewTask): Promise<TaskRecord>;
  claimReminder(
    request: ClaimTaskReminderRequest,
  ): Promise<TaskRecord | undefined>;
  clearList(
    request: ClearTaskListRequest,
  ): Promise<ClearTaskListResult | undefined>;
  clearTerminalRemindersBefore(
    request: ClearTerminalTaskRemindersRequest,
  ): Promise<number>;
  listLists(): Promise<TaskListRecord[]>;
  listTasks(): Promise<TaskRecord[]>;
  markReminderDelivered(
    request: DeliverTaskReminderRequest,
  ): Promise<TaskRecord | undefined>;
  removeTask(request: RemoveTaskRequest): Promise<TaskRecord | undefined>;
  renameList(
    request: RenameTaskListRequest,
  ): Promise<TaskListRecord | undefined>;
  updateTask(request: UpdateTaskRequest): Promise<TaskRecord | undefined>;
}
