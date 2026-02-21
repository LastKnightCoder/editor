import { useEffect, useState } from "react";
import * as tauri from "../../services/tauri";
import type {
  TodoItem,
  TodoRecurrence,
  TodoRecurrenceCompletion,
} from "../../types";
import { getTodayNormalized, isTodayScheduled } from "./recurrence";

type RecurringTaskStatus = {
  isLoading: boolean;
  isTodayCompleted: boolean;
  isTodayScheduled: boolean;
  todayCompletion: TodoRecurrenceCompletion | null;
  recurrence: TodoRecurrence | null;
  error: Error | null;
};

const INITIAL_STATUS: RecurringTaskStatus = {
  isLoading: false,
  isTodayCompleted: false,
  isTodayScheduled: false,
  todayCompletion: null,
  recurrence: null,
  error: null,
};

export function useRecurringTaskStatus(
  todoItem: TodoItem | null,
): RecurringTaskStatus {
  const [status, setStatus] = useState<RecurringTaskStatus>(INITIAL_STATUS);

  useEffect(() => {
    if (!todoItem || todoItem.type !== "recurring") {
      setStatus(INITIAL_STATUS);
      return;
    }

    let cancelled = false;
    const loadStatus = async () => {
      setStatus((previous) => ({
        ...previous,
        isLoading: true,
        error: null,
      }));

      try {
        const recurrence =
          todoItem.recurrence ??
          (await tauri.todoGetRecurrenceByItem(todoItem.id));

        if (cancelled) {
          return;
        }

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

        const completion = await tauri.todoGetRecurrenceCompletion(
          recurrence.id,
          getTodayNormalized(),
        );
        if (cancelled) {
          return;
        }

        setStatus({
          isLoading: false,
          isTodayCompleted: completion?.completedAt != null,
          isTodayScheduled: true,
          todayCompletion: completion ?? null,
          recurrence,
          error: null,
        });
      } catch (error) {
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

    void loadStatus();

    return () => {
      cancelled = true;
    };
  }, [todoItem]);

  return status;
}

export default useRecurringTaskStatus;
