import { invoke } from "@/electron";
import {
  IGoal,
  IGoalItem,
  IGoalProgressEntry,
  ICreateGoal,
  IUpdateGoal,
  ICreateGoalItem,
  IUpdateGoalItem,
  ICreateGoalProgressEntry,
  IUpdateGoalProgressEntry,
  EGoalStatus,
  IGoalWithItems,
  IGoalItemTree,
} from "@/types";

export async function createGoal(goalData: ICreateGoal): Promise<IGoal> {
  return invoke("create-goal", goalData);
}

export async function updateGoal(goalData: IUpdateGoal): Promise<IGoal> {
  return invoke("update-goal", goalData);
}

export async function deleteGoal(id: number): Promise<boolean> {
  return invoke("delete-goal", id);
}

export async function getGoalById(id: number): Promise<IGoal> {
  return invoke("get-goal-by-id", id);
}

export async function getAllGoals(): Promise<IGoal[]> {
  return invoke("get-all-goals");
}

export async function getGoalsByStatus(status: EGoalStatus): Promise<IGoal[]> {
  return invoke("get-goals-by-status", status);
}

export async function createGoalItem(
  itemData: ICreateGoalItem,
): Promise<IGoalItem> {
  return invoke("create-goal-item", itemData);
}

export async function updateGoalItem(
  itemData: IUpdateGoalItem,
): Promise<IGoalItem> {
  return invoke("update-goal-item", itemData);
}

export async function deleteGoalItem(id: number): Promise<boolean> {
  return invoke("delete-goal-item", id);
}

export async function getGoalItemById(id: number): Promise<IGoalItem> {
  return invoke("get-goal-item-by-id", id);
}

export async function getGoalItemsByGoalId(
  goalId: number,
): Promise<IGoalItem[]> {
  return invoke("get-goal-items-by-goal-id", goalId);
}

export async function getGoalItemsByParentId(
  parentId: number | null,
): Promise<IGoalItem[]> {
  return invoke("get-goal-items-by-parent-id", parentId);
}

export async function updateGoalItemProgress(
  id: number,
  progressDelta: number,
): Promise<IGoalItem> {
  return invoke("update-goal-item-progress", id, progressDelta);
}

export async function createGoalProgressEntry(
  entryData: ICreateGoalProgressEntry,
): Promise<IGoalProgressEntry> {
  return invoke("create-goal-progress-entry", entryData);
}

export async function updateGoalProgressEntry(
  entryData: IUpdateGoalProgressEntry,
): Promise<IGoalProgressEntry> {
  return invoke("update-goal-progress-entry", entryData);
}

export async function deleteGoalProgressEntry(id: number): Promise<boolean> {
  return invoke("delete-goal-progress-entry", id);
}

export async function getGoalProgressEntryById(
  id: number,
): Promise<IGoalProgressEntry> {
  return invoke("get-goal-progress-entry-by-id", id);
}

export async function getGoalProgressEntriesByGoalItemId(
  goalItemId: number,
): Promise<IGoalProgressEntry[]> {
  return invoke("get-goal-progress-entries-by-goal-item-id", goalItemId);
}

export async function getGoalWithItems(
  goalId: number,
): Promise<IGoalWithItems> {
  const goal = await getGoalById(goalId);
  const items = await getGoalItemsByGoalId(goalId);
  const progressEntries = await Promise.all(
    items.map((item) => getGoalProgressEntriesByGoalItemId(item.id)),
  );

  // 构建树状结构
  const itemsMap = new Map<number, IGoalItemTree>();
  const rootItems: IGoalItemTree[] = [];

  // 先创建所有节点
  items.forEach((item, index) => {
    const itemWithChildren: IGoalItemTree = {
      ...item,
      children: [],
      progress_entries: progressEntries[index],
    };
    itemsMap.set(item.id, itemWithChildren);
  });

  // 构建树状关系
  items.forEach((item) => {
    const itemWithChildren = itemsMap.get(item.id)!;
    if (item.parent_id) {
      const parent = itemsMap.get(item.parent_id);
      if (parent) {
        parent.children.push(itemWithChildren);
      }
    } else {
      rootItems.push(itemWithChildren);
    }
  });

  return {
    ...goal,
    items: rootItems,
  };
}
