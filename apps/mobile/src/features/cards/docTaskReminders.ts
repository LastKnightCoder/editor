import {
  Editor as SlateEditor,
  Element as SlateElement,
  Node as SlateNode,
  Transforms,
  type BaseSelection,
  type Path,
} from "slate";
import type { CheckListItemElement } from "@tau/editor/extensions/list";
import {
  canScheduleDocumentReminder,
  type DocumentReminderAccess,
  normalizeDocumentReminders,
  remindersDigest,
  toStoredTaskReminder,
} from "@tau/shared/reminders";
import {
  documentTaskReminders,
  type DocumentTaskAttributes,
  type TaskReminder,
} from "@tau/shared/task-assistant";

export type MobileDocTaskReminderTarget = {
  taskId: string | null;
  original: CheckListItemElement;
  title: string;
  recurring: boolean;
  reminders: TaskReminder[];
  baselineDigest: string;
};

export type CommitMobileDocTaskReminderResult =
  | { status: "saved"; reminders: TaskReminder[]; taskId: string }
  | {
      status: "conflict";
      reminders: TaskReminder[];
      recurring: boolean;
      taskId: string | null;
    }
  | { status: "unavailable" }
  | { status: "missing" }
  | { status: "save-failed" };

function createTaskId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function isRecurringCheckListElement(element: CheckListItemElement): boolean {
  return Boolean(element.taskRecurrence?.segments.length);
}

export function readCheckListReminders(element: CheckListItemElement): TaskReminder[] {
  const recurring = isRecurringCheckListElement(element);
  return normalizeDocumentReminders(
    documentTaskReminders(element as unknown as DocumentTaskAttributes),
    recurring
  );
}

export function findMobileCheckListItemByTaskId(
  editor: SlateEditor,
  taskId: string
): [CheckListItemElement, Path] | null {
  for (const [node, path] of SlateNode.nodes(editor)) {
    if (
      SlateElement.isElement(node) &&
      node.type === "check-list-item" &&
      (node as CheckListItemElement).taskId === taskId
    ) {
      return [node as CheckListItemElement, path];
    }
  }
  return null;
}

export function findActiveCheckListItem(
  editor: SlateEditor,
  selection?: BaseSelection | null
): [CheckListItemElement, Path] | null {
  const at = selection ?? editor.selection;
  if (!at) return null;
  try {
    const entry = SlateEditor.above(editor, {
      at,
      match: node => SlateElement.isElement(node) && node.type === "check-list-item",
    });
    return entry ? [entry[0] as CheckListItemElement, entry[1]] : null;
  } catch {
    return null;
  }
}

export function createMobileDocTaskReminderTarget(
  element: CheckListItemElement
): MobileDocTaskReminderTarget {
  const recurring = isRecurringCheckListElement(element);
  const reminders = readCheckListReminders(element);
  return {
    taskId: typeof element.taskId === "string" && element.taskId.trim() ? element.taskId : null,
    original: element,
    title: SlateNode.string(element).trim(),
    recurring,
    reminders,
    baselineDigest: remindersDigest(reminders, recurring),
  };
}

function locateTargetNode(
  editor: SlateEditor,
  target: MobileDocTaskReminderTarget
): [CheckListItemElement, Path] | null {
  if (target.taskId) {
    return findMobileCheckListItemByTaskId(editor, target.taskId);
  }
  const collabId = (target.original as CheckListItemElement & { collabId?: string }).collabId;
  for (const [node, path] of SlateNode.elements(editor)) {
    if (
      node.type === "check-list-item" &&
      (node === target.original || (collabId && "collabId" in node && node.collabId === collabId))
    ) {
      return [node as CheckListItemElement, path];
    }
  }
  return null;
}

export async function commitMobileDocTaskReminders(params: {
  editor: SlateEditor;
  target: MobileDocTaskReminderTarget;
  access: DocumentReminderAccess;
  nextReminders: readonly TaskReminder[];
  flushNow?: () => Promise<boolean>;
}): Promise<CommitMobileDocTaskReminderResult> {
  const { editor, target, nextReminders, flushNow } = params;
  const located = locateTargetNode(editor, target);
  if (!located) return { status: "missing" };

  const [liveElement, path] = located;
  if (liveElement.taskArchived || !canScheduleDocumentReminder(params.access, liveElement.taskId))
    return { status: "unavailable" };
  const liveRecurring = isRecurringCheckListElement(liveElement);
  const current = readCheckListReminders(liveElement);
  if (
    liveRecurring !== target.recurring ||
    remindersDigest(current, liveRecurring) !== target.baselineDigest
  ) {
    return {
      status: "conflict",
      reminders: current,
      recurring: liveRecurring,
      taskId: liveElement.taskId ?? null,
    };
  }

  const normalized = normalizeDocumentReminders(nextReminders, liveRecurring);
  const taskId =
    typeof liveElement.taskId === "string" && liveElement.taskId.trim()
      ? liveElement.taskId
      : createTaskId();

  Transforms.setNodes(
    editor,
    {
      ...(liveElement.taskId ? {} : { taskId }),
      taskReminder: toStoredTaskReminder(normalized, liveRecurring),
    } as Partial<CheckListItemElement>,
    { at: path }
  );

  if (flushNow) {
    const flushed = await flushNow();
    if (!flushed) return { status: "save-failed" };
  }

  return { status: "saved", reminders: normalized, taskId };
}
