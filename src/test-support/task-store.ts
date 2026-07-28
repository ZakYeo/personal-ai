import { createInMemoryTaskStore } from "../adapters/local/in-memory-task-store.js";
import type { TaskStore } from "../ports/task-store.js";
import { featureContractNow } from "./feature-contract.js";

export function createTestTaskStore(): TaskStore {
  let nextListId = 0;
  let nextTaskId = 0;
  return createInMemoryTaskStore({
    createListId: () => `task-list-${++nextListId}`,
    createTaskId: () => `task-${++nextTaskId}`,
    now: () => featureContractNow,
  });
}
