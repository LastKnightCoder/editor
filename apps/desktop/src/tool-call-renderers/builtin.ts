import { registerToolCallRenderers } from "./registry";
import AskQuestionRenderer from "./AskQuestionRenderer";
import TodoToolRenderer from "./TodoToolRenderer";
import TodoOperationRenderer from "./TodoOperationRenderer";
import { ASK_QUESTION_TOOL_NAME } from "@/tools/askQuestionTypes";

export function initToolCallRenderers(): void {
  registerToolCallRenderers([
    {
      toolName: ASK_QUESTION_TOOL_NAME,
      renderer: AskQuestionRenderer,
    },
    {
      toolName: "query_todos",
      renderer: TodoToolRenderer,
    },
    {
      toolName: "get_todo_dashboard",
      renderer: TodoToolRenderer,
    },
    {
      toolName: "get_todo_detail",
      renderer: TodoToolRenderer,
    },
    {
      toolName: "get_todo_recurrence",
      renderer: TodoOperationRenderer,
    },
    {
      toolName: "get_todo_notes",
      renderer: TodoOperationRenderer,
    },
    {
      toolName: "get_todo_calendar_mappings",
      renderer: TodoOperationRenderer,
    },
    {
      toolName: "create_todo_group",
      renderer: TodoOperationRenderer,
    },
    {
      toolName: "update_todo_group",
      renderer: TodoOperationRenderer,
    },
    {
      toolName: "archive_todo_group",
      renderer: TodoOperationRenderer,
    },
    {
      toolName: "reorder_todo_groups",
      renderer: TodoOperationRenderer,
    },
    {
      toolName: "create_todo",
      renderer: TodoOperationRenderer,
    },
    {
      toolName: "create_todo_relative",
      renderer: TodoOperationRenderer,
    },
    {
      toolName: "update_todo",
      renderer: TodoOperationRenderer,
    },
    {
      toolName: "toggle_todo_complete",
      renderer: TodoOperationRenderer,
    },
    {
      toolName: "move_todo",
      renderer: TodoOperationRenderer,
    },
    {
      toolName: "archive_todo",
      renderer: TodoOperationRenderer,
    },
    {
      toolName: "delete_todo",
      renderer: TodoOperationRenderer,
    },
    {
      toolName: "delete_todo_cascade",
      renderer: TodoOperationRenderer,
    },
    {
      toolName: "upsert_todo_recurrence",
      renderer: TodoOperationRenderer,
    },
    {
      toolName: "delete_todo_recurrence",
      renderer: TodoOperationRenderer,
    },
    {
      toolName: "complete_todo_occurrence",
      renderer: TodoOperationRenderer,
    },
    {
      toolName: "uncomplete_todo_occurrence",
      renderer: TodoOperationRenderer,
    },
    {
      toolName: "skip_todo_occurrence",
      renderer: TodoOperationRenderer,
    },
    {
      toolName: "attach_todo_note",
      renderer: TodoOperationRenderer,
    },
    {
      toolName: "create_and_attach_todo_note",
      renderer: TodoOperationRenderer,
    },
    {
      toolName: "detach_todo_note",
      renderer: TodoOperationRenderer,
    },
    {
      toolName: "reorder_todo_notes",
      renderer: TodoOperationRenderer,
    },
    {
      toolName: "update_todo_note_title_snapshot",
      renderer: TodoOperationRenderer,
    },
    {
      toolName: "create_todo_calendar_mapping",
      renderer: TodoOperationRenderer,
    },
    {
      toolName: "delete_todo_calendar_mapping",
      renderer: TodoOperationRenderer,
    },
    {
      toolName: "delete_todo_calendar_mappings_by_todo",
      renderer: TodoOperationRenderer,
    },
    {
      toolName: "sync_todo_item_to_calendar",
      renderer: TodoOperationRenderer,
    },
    {
      toolName: "remove_todo_item_from_calendar",
      renderer: TodoOperationRenderer,
    },
  ]);
}
