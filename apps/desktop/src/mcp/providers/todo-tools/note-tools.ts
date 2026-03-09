import type { ToolDefinition } from "@/types";
import {
  attachExistingNote,
  createAndAttachNote,
  detachNote,
  getTodoNoteLinkById,
  listTodoNotes,
  reorderNotes,
  updateNoteTitleSnapshot,
} from "@/commands/todo";
import { executeTodoQuery } from "@/mcp/todo/query";
import { toJson, toMutationResult, nullableNumberSchema } from "./shared";

const getTodoGroupId = async (todoId: number) => {
  const detail = await executeTodoQuery({
    filter: { todoIds: [todoId] },
    groupBy: "none",
    page: 1,
    pageSize: 1,
  });
  return detail.items[0] ?? null;
};

export const buildTodoNoteTools = (): ToolDefinition[] => [
  {
    name: "get_todo_notes",
    description:
      "获取任务关联的笔记列表。返回与该任务绑定的卡片、文章、文档或日记等内容引用，适用于回答“这条任务关联了哪些资料”。",
    parameters: {
      type: "object",
      properties: {
        todoId: { type: "number" },
      },
      required: ["todoId"],
      additionalProperties: false,
    },
    executor: async (args) => {
      const todoId = args.todoId as number;
      return toJson({
        success: true,
        todoId,
        notes: await listTodoNotes(todoId),
      });
    },
  },
  {
    name: "attach_todo_note",
    description:
      "为任务关联一个已有内容。适用于把卡片、文章、项目文档、知识库文档或日记关联到任务，便于执行时参考。",
    parameters: {
      type: "object",
      properties: {
        todoId: { type: "number" },
        contentId: { type: "number" },
        title: { type: "string" },
        type: { type: "string" },
      },
      required: ["todoId", "contentId"],
      additionalProperties: false,
    },
    executor: async (args) => {
      const link = await attachExistingNote({
        todoId: args.todoId as number,
        contentId: args.contentId as number,
        title: args.title as string | undefined,
        type: args.type as string | undefined,
      });
      return toMutationResult({
        source: "todo-mcp",
        entityType: "note-link",
        entityId: link.id,
        groupId: (await getTodoGroupId(link.todoId))?.groupId ?? null,
        relatedItemId: link.todoId,
        action: "attach-note",
        data: {
          id: link.todoId,
          title: (await getTodoGroupId(link.todoId))?.title,
          groupTitle: (await getTodoGroupId(link.todoId))?.group?.title,
        },
      });
    },
  },
  {
    name: "create_and_attach_todo_note",
    description:
      "为任务新建一条笔记并立即关联。适用于用户想围绕当前任务补充说明、步骤或执行记录。",
    parameters: {
      type: "object",
      properties: {
        todoId: { type: "number" },
        initialTitle: { type: "string" },
      },
      required: ["todoId"],
      additionalProperties: false,
    },
    executor: async (args) => {
      const data = await createAndAttachNote(
        args.todoId as number,
        args.initialTitle as string | undefined,
      );
      return toMutationResult({
        source: "todo-mcp",
        entityType: "note-link",
        entityId: data.link.id,
        groupId: (await getTodoGroupId(data.link.todoId))?.groupId ?? null,
        relatedItemId: data.link.todoId,
        action: "create-and-attach-note",
        data: {
          id: data.link.todoId,
          title: (await getTodoGroupId(data.link.todoId))?.title,
          groupTitle: (await getTodoGroupId(data.link.todoId))?.group?.title,
        },
      });
    },
  },
  {
    name: "detach_todo_note",
    description:
      "解除任务与某条笔记的关联。不会删除笔记本身，只移除任务到该内容的引用关系。",
    parameters: {
      type: "object",
      properties: {
        linkId: { type: "number" },
        todoId: nullableNumberSchema,
      },
      required: ["linkId"],
      additionalProperties: false,
    },
    executor: async (args) => {
      const link = await getTodoNoteLinkById(args.linkId as number);
      await detachNote(args.linkId as number);
      return toMutationResult({
        source: "todo-mcp",
        entityType: "note-link",
        entityId: args.linkId as number,
        groupId:
          link?.todoId != null
            ? ((await getTodoGroupId(link.todoId))?.groupId ?? null)
            : args.todoId !== undefined && args.todoId !== null
              ? ((await getTodoGroupId(args.todoId as number))?.groupId ?? null)
              : null,
        relatedItemId:
          link?.todoId ?? (args.todoId as number | null | undefined) ?? null,
        action: "detach-note",
        data: {
          id: link?.todoId ?? (args.todoId as number | null | undefined),
          title:
            link?.todoId != null
              ? (await getTodoGroupId(link.todoId))?.title
              : args.todoId != null
                ? (await getTodoGroupId(args.todoId as number))?.title
                : undefined,
          groupTitle:
            link?.todoId != null
              ? (await getTodoGroupId(link.todoId))?.group?.title
              : args.todoId != null
                ? (await getTodoGroupId(args.todoId as number))?.group?.title
                : undefined,
        },
      });
    },
  },
  {
    name: "reorder_todo_notes",
    description:
      "重排任务关联笔记的显示顺序。适用于用户希望把更重要或更常用的参考资料排在前面。",
    parameters: {
      type: "object",
      properties: {
        todoId: { type: "number" },
        orderedLinkIds: { type: "array", items: { type: "number" } },
      },
      required: ["todoId", "orderedLinkIds"],
      additionalProperties: false,
    },
    executor: async (args) => {
      await reorderNotes(
        args.todoId as number,
        args.orderedLinkIds as number[],
      );
      const todoContext = await getTodoGroupId(args.todoId as number);
      return toMutationResult({
        source: "todo-mcp",
        entityType: "note-link",
        groupId: todoContext?.groupId ?? null,
        relatedItemId: args.todoId as number,
        action: "reorder-notes",
        changedFields: ["sortIndex"],
        data: {
          id: args.todoId as number,
          title: todoContext?.title,
          groupTitle: todoContext?.group?.title,
        },
      });
    },
  },
  {
    name: "update_todo_note_title_snapshot",
    description:
      "更新任务关联笔记上的标题快照。适用于关联关系中展示名称需要同步或手动修正的场景。",
    parameters: {
      type: "object",
      properties: {
        linkId: { type: "number" },
        title: { type: "string" },
        todoId: nullableNumberSchema,
      },
      required: ["linkId", "title"],
      additionalProperties: false,
    },
    executor: async (args) => {
      const link = await getTodoNoteLinkById(args.linkId as number);
      await updateNoteTitleSnapshot(
        args.linkId as number,
        args.title as string,
      );
      const todoContext =
        link?.todoId != null
          ? await getTodoGroupId(link.todoId)
          : args.todoId != null
            ? await getTodoGroupId(args.todoId as number)
            : null;
      return toMutationResult({
        source: "todo-mcp",
        entityType: "note-link",
        entityId: args.linkId as number,
        groupId: todoContext?.groupId ?? null,
        relatedItemId:
          link?.todoId ?? (args.todoId as number | null | undefined) ?? null,
        action: "update-note-title-snapshot",
        changedFields: ["title"],
        data: {
          id: link?.todoId ?? (args.todoId as number | null | undefined),
          title: todoContext?.title,
          groupTitle: todoContext?.group?.title,
        },
      });
    },
  },
];
