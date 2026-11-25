import { TaskAssistantError, type TaskOccurrenceState } from "./contracts";

export interface TaskOccurrencePatch {
  completed?: boolean;
  skipped?: boolean;
  scheduledAt?: string | null;
}
export function patchOccurrenceState(
  state: TaskOccurrenceState,
  patch: TaskOccurrencePatch,
  now: number
): TaskOccurrenceState {
  if (!Object.keys(patch).length || (patch.completed === true && patch.skipped === true))
    throw new TaskAssistantError("INVALID_ARGUMENT", "实例补丁不能为空，完成和跳过不能同时为 true");
  const result = { ...state };
  if (patch.completed !== undefined)
    result.completedAt = patch.completed ? (state.completedAt ?? now) : null;
  if (patch.skipped !== undefined) result.skipped = patch.skipped;
  if (patch.completed === true) result.skipped = false;
  if (patch.skipped === true) result.completedAt = null;
  if ("scheduledAt" in patch) result.scheduledAt = patch.scheduledAt;
  return result;
}
