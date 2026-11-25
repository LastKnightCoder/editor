import { requireGroup } from "./directory-access";
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import {
  occurrenceKey,
  normalizeTaskRecurrenceRule,
  patchOccurrenceState,
  type TaskOccurrencePatch,
  documentTaskIsChecked,
  type AssistantTask,
  type DocumentTaskAttributes,
  type TaskOccurrenceRef,
  type TaskOccurrenceState,
  type TaskRecurrenceRule,
  type TaskRef,
} from "@tau/shared/task-assistant";
import {
  extractDocTasks,
  docTaskTokenSpans,
  isAbsoluteDateHint,
  type DocTaskGroupBinding,
} from "@/entity/doc-tasks";
import { minimalTextEdit } from "@/entity/text-edits";
import { listTaskGroups } from "../doc-tasks/group-names";
import { resolveDocTaskSources } from "../doc-tasks/sources";
import { nodeText, patchParagraph } from "../content-node-patches";
import {
  readTaskContent,
  taskNode,
  assertTaskContentWritable,
  type TaskContentNode,
} from "../content-task-patches";
import { amendSegments } from "./recurrence";
import { assertTaskOccurrence as assertOccurrence } from "./holidays";
import {
  canonical,
  checkRevision,
  fail,
  localDate,
  dateTime,
  revision,
  instanceRevision,
} from "./common";

export interface DocumentSnapshot {
  ref: Extract<TaskRef, { kind: "document" }>;
  node: TaskContentNode | null;
  parentTaskId: string | null;
  previousTaskId: string | null;
  nextTaskId: string | null;
  containerPath: number[];
  containerAnchor: string;
  containerContext?: { attributes: Record<string, unknown>; previous: string; next: string };
}
export interface DocumentEdit {
  previous: TaskContentNode[];
  next: TaskContentNode[];
  before: DocumentSnapshot;
  after: DocumentSnapshot;
}
type TaskNode = TaskContentNode & DocumentTaskAttributes;

function locate(
  nodes: TaskContentNode[],
  id: string,
  parentTaskId: string | null = null,
  path: number[] = []
):
  | {
      siblings: TaskContentNode[];
      index: number;
      parentTaskId: string | null;
      containerPath: number[];
    }
  | undefined {
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index];
    if (node.type === "check-list-item" && node.taskId === id)
      return { siblings: nodes, index, parentTaskId, containerPath: path };
    const childParentTaskId = node.type === "check-list-item" ? node.taskId : parentTaskId;
    const child = locate(node.children ?? [], id, childParentTaskId ?? null, [...path, index]);
    if (child) return child;
  }
}
function containerAt(tree: TaskContentNode[], path: number[]) {
  let siblings = tree,
    anchor: unknown = null,
    context: DocumentSnapshot["containerContext"];
  for (const index of path) {
    const parent = siblings[index];
    if (!parent?.children) return null;
    const { children: _children, ...attributes } = parent;
    anchor = {
      attributes,
      previous: siblings[index - 1] ?? null,
      next: siblings[index + 1] ?? null,
    };
    context = {
      attributes,
      previous: revision(siblings[index - 1] ?? null),
      next: revision(siblings[index + 1] ?? null),
    };
    siblings = parent.children;
  }
  return { siblings, anchor: revision(anchor), context };
}
export function documentSnapshot(
  nodes: TaskContentNode[],
  ref: Extract<TaskRef, { kind: "document" }>
): DocumentSnapshot {
  const location = locate(nodes, ref.taskId);
  const container = location ? containerAt(nodes, location.containerPath) : undefined;
  return {
    ref,
    node: location ? structuredClone(location.siblings[location.index]) : null,
    parentTaskId: location?.parentTaskId ?? null,
    previousTaskId: location?.siblings[location.index - 1]?.taskId ?? null,
    nextTaskId: location?.siblings[location.index + 1]?.taskId ?? null,
    containerPath: location?.containerPath ?? [],
    containerAnchor: container ? container.anchor : "",
    containerContext: container?.context,
  };
}
function removeEmptyTaskContainer(tree: TaskContentNode[], path: number[]) {
  const parent = containerAt(tree, path.slice(0, -1)),
    index = path.at(-1);
  if (!parent || index === undefined) return;
  const node = parent.siblings[index];
  if (node?.type === "check-list" && !node.children?.length) parent.siblings.splice(index, 1);
}
export function readDocumentTask(
  db: Database.Database,
  ref: Extract<TaskRef, { kind: "document" }>,
  cachedTree?: TaskContentNode[]
): AssistantTask {
  const tree = cachedTree ?? readTaskContent(db, ref.contentId, ref.createdAt);
  const node = taskNode(tree, ref.taskId) as TaskNode | undefined;
  if (!node) return fail("NOT_FOUND", "原文中已没有这个待办");
  const groups = listTaskGroups(db);
  const parsed = extractDocTasks([node], groups).tasks[0];
  if (!parsed) return fail("NOT_FOUND", "待办身份无效");
  const unanchored =
    !!parsed.dateHint && !isAbsoluteDateHint(parsed.dateHint) && parsed.dateAnchor == null;
  const due = unanchored ? null : parsed.dueAt;
  const groupSpan = unanchored
    ? docTaskTokenSpans(parsed.text, groups).find(span => span.kind === "group")
    : undefined;
  const title = unanchored
    ? (groupSpan
        ? parsed.text.slice(0, groupSpan.start) + " " + parsed.text.slice(groupSpan.end)
        : parsed.text
      )
        .replace(/\s+/g, " ")
        .trim()
    : parsed.title;
  let readonlyReason: string | undefined;
  try {
    assertTaskContentWritable(db, ref.contentId);
  } catch (error) {
    readonlyReason = error instanceof Error ? error.message : "正文不可写";
  }
  const source = resolveDocTaskSources(db, [ref.contentId]).get(ref.contentId);
  if (!source) readonlyReason = "原文来源已删除，不能继续修改或安排该待办";
  return {
    taskRef: ref,
    revision: revision({
      snapshot: documentSnapshot(tree, ref),
      title,
      groupId: parsed.groupId,
      dueAt: due,
    }),
    documentRevision: revision(tree),
    title,
    ...(source
      ? {
          sourceTitle: source.title ?? undefined,
          sourceRef: {
            kind: source.kind as "card" | "article" | "project-item" | "diary-moment",
            id: source.id,
          },
        }
      : {}),
    completed: documentTaskIsChecked(node),
    archived: node.taskArchived === true,
    dueAt:
      due == null
        ? null
        : parsed.dateHint?.includes(":")
          ? new Date(due).toISOString()
          : localDate(due),
    groupId: parsed.groupId,
    reminderAt: node.taskReminder?.at ?? null,
    recurrence: (node.taskRecurrence?.segments ?? []).map(segment => ({
      ...segment,
      rule: segment.rule ? normalizeTaskRecurrenceRule(segment.rule) : null,
    })),
    writable: !readonlyReason,
    ...(readonlyReason ? { readonlyReason } : {}),
  };
}

function taskList(tree: TaskContentNode[], parentTaskId?: string | null): TaskContentNode[] {
  const parent = parentTaskId ? taskNode(tree, parentTaskId) : undefined;
  if (parentTaskId && !parent) return fail("NOT_FOUND", "目标父待办不存在");
  const children = parent ? (parent.children ??= []) : tree;
  let list = children.find(node => node.type === "check-list");
  if (!list) {
    list = { type: "check-list", children: [] };
    children.push(list);
  }
  return (list.children ??= []);
}

export function prepareDocumentCreate(
  db: Database.Database,
  input: {
    title: string;
    document: { contentId: number; createdAt: number; revision: string; afterTaskId?: string };
    parentRef?: TaskRef;
    groupId?: number;
    dueAt?: string | null;
    reminderAt?: string | null;
    recurrence?: TaskRecurrenceRule;
  }
): DocumentEdit {
  const { document } = input;
  if (!resolveDocTaskSources(db, [document.contentId]).has(document.contentId))
    fail("NOT_FOUND", "原文没有有效业务来源");
  assertTaskContentWritable(db, document.contentId);
  const previous = readTaskContent(db, document.contentId, document.createdAt);
  checkRevision(document.revision, revision(previous));
  const next = structuredClone(previous);
  const ref = {
    kind: "document" as const,
    contentId: document.contentId,
    createdAt: document.createdAt,
    taskId: randomUUID(),
  };
  const node: TaskNode = {
    type: "check-list-item",
    taskId: ref.taskId,
    checked: false,
    children: [{ type: "paragraph", children: [{ type: "formatted", text: input.title }] }],
  };
  patchDocumentFields(db, node, input);
  if (input.recurrence)
    node.taskRecurrence = {
      version: 1,
      segments: amendSegments([], input.recurrence.startDate, input.recurrence),
    };
  const parent = input.parentRef;
  if (
    parent &&
    (parent.kind !== "document" ||
      parent.contentId !== ref.contentId ||
      parent.createdAt !== ref.createdAt)
  )
    fail("INVALID_ARGUMENT", "父待办必须位于同一正文");
  const after = document.afterTaskId ? locate(next, document.afterTaskId) : undefined;
  if (document.afterTaskId && !after) fail("NOT_FOUND", "插入位置已变化");
  if (
    after &&
    parent &&
    after.parentTaskId !== (parent as Extract<TaskRef, { kind: "document" }>).taskId
  )
    fail("INVALID_ARGUMENT", "插入位置与父待办不一致");
  if (after) after.siblings.splice(after.index + 1, 0, node);
  else taskList(next, parent?.kind === "document" ? parent.taskId : null).push(node);
  return {
    previous,
    next,
    before: { ...documentSnapshot(next, ref), node: null },
    after: documentSnapshot(next, ref),
  };
}

function patchDocumentFields(
  db: Database.Database,
  node: TaskNode,
  patch: Record<string, unknown>
) {
  const paragraph = node.children?.[0];
  if (!paragraph) return fail("INVALID_CONTENT", "待办缺少正文段落");
  const groups = listTaskGroups(db);
  let text = nodeText(paragraph);
  const original = text;
  let spans = docTaskTokenSpans(
    text,
    groups,
    new Date(),
    node.taskGroup as DocTaskGroupBinding | undefined
  );
  if (typeof patch.title === "string") {
    const tokens = spans.map(span => text.slice(span.start, span.end));
    text = [patch.title, ...tokens].join(" ");
  }
  for (const field of ["groupId", "dueAt"] as const)
    if (field in patch) {
      spans = docTaskTokenSpans(text, groups);
      const span = spans.find(entry => entry.kind === (field === "groupId" ? "group" : "date"));
      let replacement = "";
      if (field === "groupId") {
        requireGroup(db, Number(patch.groupId));
        const group = groups.find(entry => entry.id === patch.groupId);
        if (!group) return fail("NOT_FOUND", "正文待办的项目不存在");
        replacement = `#${group.title}`;
        node.taskGroup = { id: group.id, token: replacement, createdAt: group.createdAt };
      } else {
        replacement = patch.dueAt == null ? "" : String(patch.dueAt);
        node.taskDateAnchor = null;
      }
      text = span
        ? text.slice(0, span.start) + replacement + text.slice(span.end)
        : [text, replacement].filter(Boolean).join(" ");
    }
  const edit = ["title", "groupId", "dueAt"].some(key => key in patch)
    ? minimalTextEdit(original, text.trim())
    : null;
  if (edit) patchParagraph(paragraph, [edit]);
  if ("reminderAt" in patch) {
    if (patch.reminderAt != null && String(patch.reminderAt).length === 10)
      fail("INVALID_ARGUMENT", "提醒必须有明确时刻");
    node.taskReminder =
      patch.reminderAt == null ? null : { version: 1, at: String(patch.reminderAt) };
  }
  if ("reminders" in patch) {
    const reminders = patch.reminders as Array<{ offsetMs?: number; at?: string }>;
    if (reminders.length > 1) fail("INVALID_ARGUMENT", "正文待办只支持一条提醒");
    const reminder = reminders[0];
    if (!reminder) node.taskReminder = null;
    else if (node.taskRecurrence?.segments.length) {
      const offset = reminder.offsetMs;
      if (reminder.at !== undefined || offset === undefined || offset > 0 || offset <= -86400000)
        fail("INVALID_ARGUMENT", "重复正文提醒需要当日时刻偏移");
      const midnight = dateTime(localDate(Date.now()));
      const anchor = new Date(midnight),
        clock = -offset!;
      anchor.setHours(
        Math.floor(clock / 3600000),
        Math.floor(clock / 60000) % 60,
        Math.floor(clock / 1000) % 60,
        clock % 1000
      );
      if (
        anchor.getHours() * 3600000 +
          anchor.getMinutes() * 60000 +
          anchor.getSeconds() * 1000 +
          anchor.getMilliseconds() !==
          clock ||
        anchor.getTime() - midnight !== clock
      )
        fail("AMBIGUOUS_TIME", "提醒时刻存在夏令时歧义");
      node.taskReminder = { version: 1, at: anchor.toISOString() };
    } else {
      if (!reminder.at || reminder.at.length <= 10 || reminder.offsetMs !== undefined)
        fail("INVALID_ARGUMENT", "普通正文提醒需要绝对时刻");
      node.taskReminder = { version: 1, at: reminder.at! };
    }
  }
  if ("archived" in patch) node.taskArchived = patch.archived === true;
}

export function prepareDocumentEdit(
  db: Database.Database,
  ref: Extract<TaskRef, { kind: "document" }>,
  expectedRevision: string,
  action: string,
  input: {
    patch?: Record<string, unknown>;
    completed?: boolean;
    children?: string;
    occurrence?: TaskOccurrenceRef;
    action?: string;
    scheduledAt?: string;
    effectiveDate?: string;
    rule?: TaskRecurrenceRule | null;
    statePatch?: TaskOccurrencePatch;
  }
): DocumentEdit {
  assertTaskContentWritable(db, ref.contentId);
  if (!resolveDocTaskSources(db, [ref.contentId]).has(ref.contentId))
    fail("NOT_FOUND", "原文来源已删除");
  const previous = readTaskContent(db, ref.contentId, ref.createdAt);
  const before = documentSnapshot(previous, ref);
  if (!before.node) return fail("NOT_FOUND", "原文中已没有这个待办");
  const current = readDocumentTask(db, ref, previous);
  const expected =
    input.occurrence && expectedRevision !== current.revision
      ? instanceRevision(
          current,
          input.occurrence,
          (before.node as TaskNode).taskOccurrenceState?.[occurrenceKey(input.occurrence)] ?? {}
        )
      : current.revision;
  checkRevision(expectedRevision, expected);
  const next = structuredClone(previous);
  const location = locate(next, ref.taskId);
  if (!location) return fail("NOT_FOUND", "原文中已没有这个待办");
  const node = location.siblings[location.index] as TaskNode;
  if (action === "update_todo") {
    const patch = input.patch;
    if (!patch || !Object.keys(patch).length) return fail("INVALID_ARGUMENT", "修改字段不能为空");
    patchDocumentFields(db, node, patch);
    if ("parentRef" in patch) {
      const parent = patch.parentRef as TaskRef | null;
      if (
        parent &&
        (parent.kind !== "document" ||
          parent.contentId !== ref.contentId ||
          parent.createdAt !== ref.createdAt ||
          taskNode([node], parent.taskId))
      )
        fail("INVALID_ARGUMENT", "不能跨正文移动或形成父子循环");
      location.siblings.splice(location.index, 1);
      removeEmptyTaskContainer(next, location.containerPath);
      taskList(next, parent?.kind === "document" ? parent.taskId : null).push(node);
    }
  } else if (action === "delete_todo") {
    const children =
      node.children
        ?.filter(child => child.type === "check-list")
        .flatMap(child => child.children ?? []) ?? [];
    if (children.length && (!input.children || input.children === "reject"))
      fail("HAS_CHILDREN", "待办包含子项，请明确保留或级联删除");
    location.siblings.splice(location.index, 1, ...(input.children === "preserve" ? children : []));
    removeEmptyTaskContainer(next, location.containerPath);
  } else if (action === "set_todo_recurrence") {
    const effectiveDate = input.effectiveDate;
    if (!effectiveDate) return fail("INVALID_ARGUMENT", "设置周期必须指定生效日期");
    if (!node.taskRecurrence?.segments.length && !input.rule)
      fail("INVALID_ARGUMENT", "普通待办没有可停止的重复规则");
    if (!node.taskRecurrence?.segments.length && node.taskReminder)
      fail("INVALID_ARGUMENT", "请先清空普通待办提醒，再设置重复规则");
    const previousSegments = node.taskRecurrence?.segments ?? [];
    const segments = amendSegments(previousSegments, effectiveDate, input.rule ?? null);
    const normalized = (values: typeof segments) =>
      values.map(segment => ({
        ...segment,
        rule: segment.rule ? normalizeTaskRecurrenceRule(segment.rule) : null,
      }));
    if (revision(normalized(previousSegments)) !== revision(normalized(segments)))
      node.taskRecurrence = { version: 1, segments };
  } else {
    const segments = node.taskRecurrence?.segments ?? [];
    if (input.occurrence || segments.length) {
      const occurrence = input.occurrence;
      if (!occurrence) return fail("INVALID_ARGUMENT", "周期待办须指定单次实例");
      assertOccurrence(segments, occurrence);
      const key = occurrenceKey(occurrence);
      let state: TaskOccurrenceState = { ...node.taskOccurrenceState?.[key] };
      if (input.action === "patch") {
        state = patchOccurrenceState(state, input.statePatch ?? {}, Date.now());
      } else if (action === "set_todo_completed") {
        state.completedAt = input.completed ? Date.now() : null;
        state.skipped = false;
      } else if (input.action === "reschedule") {
        if (!input.scheduledAt) fail("INVALID_ARGUMENT", "改期必须指定 scheduledAt");
        state.scheduledAt = input.scheduledAt;
      } else {
        state.skipped = input.action === "skip";
        state.completedAt = null;
      }
      node.taskOccurrenceState = { ...node.taskOccurrenceState, [key]: state };
    } else {
      node.checked = input.completed === true;
      node.taskCompletedAt = input.completed ? Date.now() : null;
    }
  }
  const after = documentSnapshot(next, ref);
  return { previous, next, before, after: after.node ? after : { ...before, node: null } };
}

export function prepareDocumentUndo(
  db: Database.Database,
  before: DocumentSnapshot,
  after: DocumentSnapshot
): DocumentEdit {
  assertTaskContentWritable(db, before.ref.contentId);
  if (!resolveDocTaskSources(db, [before.ref.contentId]).has(before.ref.contentId))
    fail("UNDO_CONFLICT", "原文来源已删除，不能自动恢复待办");
  const previous = readTaskContent(db, before.ref.contentId, before.ref.createdAt);
  const current = documentSnapshot(previous, before.ref);
  if (
    canonical(current.node) !== canonical(after.node) ||
    (current.node && current.parentTaskId !== after.parentTaskId)
  )
    fail("UNDO_CONFLICT", "正文待办已有后续修改，不能覆盖");
  const next = structuredClone(previous);
  const existing = locate(next, before.ref.taskId);
  if (existing) existing.siblings.splice(existing.index, 1);
  if (existing && (!before.node || existing.parentTaskId !== before.parentTaskId))
    removeEmptyTaskContainer(next, existing.containerPath);
  if (before.node) {
    const previousSibling = before.previousTaskId ? locate(next, before.previousTaskId) : undefined;
    const nextSibling = before.nextTaskId ? locate(next, before.nextTaskId) : undefined;
    if ((before.previousTaskId && !previousSibling) || (before.nextTaskId && !nextSibling))
      fail("UNDO_CONFLICT", "原文恢复位置已变化");
    if (
      (previousSibling && previousSibling.parentTaskId !== before.parentTaskId) ||
      (nextSibling && nextSibling.parentTaskId !== before.parentTaskId)
    )
      fail("UNDO_CONFLICT", "原文相邻待办已移动");
    if (
      previousSibling &&
      nextSibling &&
      (previousSibling.siblings !== nextSibling.siblings ||
        previousSibling.index + 1 !== nextSibling.index)
    )
      fail("UNDO_CONFLICT", "原文恢复位置不再唯一");
    if (previousSibling) previousSibling.siblings.splice(previousSibling.index + 1, 0, before.node);
    else if (nextSibling) nextSibling.siblings.splice(nextSibling.index, 0, before.node);
    else {
      const container = containerAt(next, before.containerPath);
      if (container && container.anchor === before.containerAnchor && !container.siblings.length)
        container.siblings.push(before.node);
      else {
        const parent = containerAt(next, before.containerPath.slice(0, -1));
        const index = before.containerPath.at(-1) ?? 0;
        const context = before.containerContext;
        const placeholder = parent?.siblings[index];
        if (
          parent &&
          context &&
          placeholder?.type === "paragraph" &&
          placeholder.children?.every(
            child => typeof child.text === "string" && child.text === ""
          ) &&
          context.previous === revision(parent.siblings[index - 1] ?? null) &&
          context.next === revision(parent.siblings[index + 1] ?? null)
        ) {
          parent.siblings.splice(index, 1, { ...context.attributes, children: [before.node] });
          return { previous, next, before: current, after: before };
        }
        if (
          !parent ||
          !context ||
          context.previous !== revision(parent.siblings[index - 1] ?? null) ||
          context.next !== revision(parent.siblings[index] ?? null)
        )
          return fail("UNDO_CONFLICT", "原文恢复位置已变化，不能猜测插入位置");
        parent.siblings.splice(index, 0, { ...context.attributes, children: [before.node] });
      }
    }
  }
  return { previous, next, before: current, after: before };
}
