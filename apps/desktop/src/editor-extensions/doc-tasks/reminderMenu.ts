/**
 * 编辑器内正文勾选项提醒浮层状态与条件写回：
 * - 每次提交前按 taskId 重查实时节点，校验基线提醒指纹；
 * - 若协作同步或插件已在面板打开期间修改过同一组提醒，则拒绝覆盖、刷新最新列表并提示；
 * - 写入仅修改 check-list-item 的 taskReminder 属性，保留 taskId、collabId、格式与未保存编辑。
 */

import { create } from "zustand";
import { createContext } from "react";
import { Editor, Element, Transforms, type NodeEntry } from "slate";
import { captureEditorSubmission, type Submission } from "@tau/editor/api";
import type { CheckListItemElement } from "@tau/editor/extensions/list";
import { documentTaskReminders, type TaskReminder } from "@tau/shared/task-assistant";
import {
  remindersDigest,
  toStoredTaskReminder,
  type DocumentReminderAccess,
} from "@tau/shared/reminders";

export const DocTaskReminderAccessContext = createContext<{
  access?: DocumentReminderAccess;
  refresh(): Promise<DocumentReminderAccess | undefined>;
} | null>(null);

export interface DocTaskReminderMenuState {
  editor: Editor | null;
  anchor: HTMLElement | null;
  taskId: string | null;
  recurring: boolean;
  reminders: TaskReminder[];
  baselineDigest: string;
  submission: Submission<void> | null;
}

export const useDocTaskReminderMenuStore = create<DocTaskReminderMenuState>(() => ({
  editor: null,
  anchor: null,
  taskId: null,
  recurring: false,
  reminders: [],
  baselineDigest: "",
  submission: null,
}));

export function findCheckListItemByTaskId(
  editor: Editor,
  taskId: string
): NodeEntry<CheckListItemElement> | null {
  for (const entry of Editor.nodes(editor, {
    at: [],
    match: node =>
      Element.isElement(node) &&
      node.type === "check-list-item" &&
      (node as CheckListItemElement).taskId === taskId,
  })) {
    return entry as NodeEntry<CheckListItemElement>;
  }
  return null;
}

export function closeDocTaskReminderMenu() {
  const { submission } = useDocTaskReminderMenuStore.getState();
  submission?.dispose();
  useDocTaskReminderMenuStore.setState({
    editor: null,
    anchor: null,
    taskId: null,
    recurring: false,
    reminders: [],
    baselineDigest: "",
    submission: null,
  });
}

export function openDocTaskReminderMenu(
  editor: Editor,
  anchor: HTMLElement,
  element: CheckListItemElement
) {
  const prev = useDocTaskReminderMenuStore.getState();
  if (prev.editor === editor && prev.taskId && prev.taskId === element.taskId) {
    closeDocTaskReminderMenu();
    return;
  }
  closeDocTaskReminderMenu();

  let taskId = element.taskId;
  if (!taskId) {
    for (const [node, path] of Editor.nodes(editor, {
      at: [],
      match: candidate => candidate === element,
    })) {
      if (Element.isElement(node) && node.type === "check-list-item") {
        taskId = crypto.randomUUID();
        Transforms.setNodes(editor, { taskId } as Partial<CheckListItemElement>, { at: path });
        break;
      }
    }
  }
  if (!taskId) return;

  const live = findCheckListItemByTaskId(editor, taskId)?.[0] ?? element;
  const recurring = Boolean(live.taskRecurrence?.segments?.length);
  const reminders = documentTaskReminders(live);

  useDocTaskReminderMenuStore.setState({
    editor,
    anchor,
    taskId,
    recurring,
    reminders,
    baselineDigest: remindersDigest(reminders, recurring),
    submission: captureEditorSubmission(editor),
  });
}

export type DocTaskReminderCommitStatus = "ok" | "conflict" | "missing";

export function commitDocTaskReminders(nextReminders: TaskReminder[]): DocTaskReminderCommitStatus {
  const state = useDocTaskReminderMenuStore.getState();
  const { editor, taskId, baselineDigest, submission } = state;
  if (!editor || !taskId || !submission) return "missing";

  let status: DocTaskReminderCommitStatus = "missing";
  let nextState:
    | Pick<DocTaskReminderMenuState, "recurring" | "reminders" | "baselineDigest">
    | undefined;

  submission.commit(() => {
    const entry = findCheckListItemByTaskId(editor, taskId);
    if (!entry || entry[0].taskArchived) {
      status = "missing";
      return undefined;
    }
    const [liveNode, livePath] = entry;
    const liveRecurring = Boolean(liveNode.taskRecurrence?.segments?.length);
    const liveReminders = documentTaskReminders(liveNode);
    const liveDigest = remindersDigest(liveReminders, liveRecurring);

    if (liveDigest !== baselineDigest) {
      status = "conflict";
      nextState = {
        recurring: liveRecurring,
        reminders: liveReminders,
        baselineDigest: liveDigest,
      };
      return undefined;
    }

    const stored = toStoredTaskReminder(nextReminders, liveRecurring);
    Transforms.setNodes(editor, { taskReminder: stored } as Partial<CheckListItemElement>, {
      at: livePath,
    });
    const saved = documentTaskReminders({ ...liveNode, taskReminder: stored });
    status = "ok";
    nextState = {
      recurring: liveRecurring,
      reminders: saved,
      baselineDigest: remindersDigest(saved, liveRecurring),
    };
    return undefined;
  });

  if (status === "missing") {
    closeDocTaskReminderMenu();
  } else if (nextState !== undefined) {
    // 浮层保持打开时用户可能连续增改删，重抓一次提交守卫以继续监听文档/只读变化
    useDocTaskReminderMenuStore.setState({
      ...(nextState as Pick<
        DocTaskReminderMenuState,
        "recurring" | "reminders" | "baselineDigest"
      >),
      submission: captureEditorSubmission(editor),
    });
  }
  return status;
}
