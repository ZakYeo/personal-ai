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
      deliveredAt: string;
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
