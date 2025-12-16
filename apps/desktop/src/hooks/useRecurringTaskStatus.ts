import { useEffect, useState } from "react";
import { TodoItem, TodoRecurrence, TodoRecurrenceCompletion } from "@/types";
import { getRecurrenceByItemId, getRecurrenceCompletion } from "@/commands/todo";
import { getTodayNormalized, getStartOfDayTimestamp, isTodayScheduled } from "@/utils/recurrence";

interface RecurringTaskStatus {
  isLoading: boolean;
  isTodayCompleted: boolean;
  isTodayScheduled: boolean;
  todayCompletion: TodoRecurrenceCompletion | null;
  recurrence: TodoRecurrence | null;
  error: Error | null;
}

const INITIAL_STATUS: RecurringTaskStatus = {
  isLoading: false,
  isTodayCompleted: false,
  isTodayScheduled: false,
  todayCompletion: null,
  recurrence: null,
  error: null,
};

/**
 * Hook to fetch and track today's completion status for a recurring task
 */
export function useRecurringTaskStatus(todoItem: TodoItem | null): RecurringTaskStatus {
  const [status, setStatus] = useState<RecurringTaskStatus>(INITIAL_STATUS);

  useEffect(() => {
    // Reset if not a recurring task or no item
    if (!todoItem || todoItem.type !== "recurring") {
      setStatus(INITIAL_STATUS);
      return;
    }

    let cancelled = false;
    const loadStatus = async () => {
      setStatus((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        // Fetch recurrence config
        const recurrence = todoItem.recurrence || (await getRecurrenceByItemId(todoItem.id));

        if (cancelled) return;

        if (!recurrence) {
          setStatus({
            isLoading: false,
            isTodayCompleted: false,
            isTodayScheduled: false,
            todayCompletion: null,
            recurrence: null,
            error: null,
          });
          return;
        }

        // Check if today is scheduled
        const todayScheduled = isTodayScheduled(recurrence);

        if (!todayScheduled) {
          setStatus({
            isLoading: false,
            isTodayCompleted: false,
            isTodayScheduled: false,
            todayCompletion: null,
            recurrence,
            error: null,
          });
          return;
        }

        // Fetch today's completion
        const today = getTodayNormalized();
        const todayTimestamp = getStartOfDayTimestamp(today);
        const completion = await getRecurrenceCompletion(recurrence.id, todayTimestamp);

        if (cancelled) return;

        setStatus({
          isLoading: false,
          isTodayCompleted: completion?.completedAt != null,
          isTodayScheduled: true,
          todayCompletion: completion,
          recurrence,
          error: null,
        });
      } catch (error) {
        console.error("Failed to load recurring task status:", error);
        if (!cancelled) {
          setStatus({
            isLoading: false,
            isTodayCompleted: false,
            isTodayScheduled: false,
            todayCompletion: null,
            recurrence: null,
            error: error as Error,
          });
        }
      }
    };

    loadStatus();

    return () => {
      cancelled = true;
    };
  }, [todoItem?.id, todoItem?.type, todoItem?.recurrence]);

  return status;
}
