import { registerToolCallRenderers } from "./registry";
import AskQuestionRenderer from "./AskQuestionRenderer";
import TodoToolRenderer from "./TodoToolRenderer";
import TodoOperationRenderer from "./TodoOperationRenderer";
import CalendarQueryRenderer from "./CalendarQueryRenderer";
import CalendarOperationRenderer from "./CalendarOperationRenderer";
import QuestionQueryRenderer from "./QuestionQueryRenderer";
import QuestionOperationRenderer from "./QuestionOperationRenderer";
import StructuredToolResultRenderer from "./StructuredToolResultRenderer";
import KnowledgeSearchRenderer from "./KnowledgeSearchRenderer";
import ContentEditProposalRenderer from "./ContentEditProposalRenderer";
import { ASK_QUESTION_TOOL_NAME } from "@/tools/askQuestionTypes";
import OpenAIImageResultRenderer from "./OpenAIImageResultRenderer";
import { OPENAI_IMAGE_RENDERER_KEY } from "@/tools/openaiImageTools";
import SubAgentResearchRenderer from "./SubAgentResearchRenderer";
import { SUBAGENT_RESEARCH_RENDERER_KEY } from "@/tools/subagentTool";
import VLProductRenderer from "@/features/vibe-learning/views/VibeLearningView/chat/ProductCard";
import { VL_PRODUCT_RENDERER_KEY } from "@/features/vibe-learning/views/VibeLearningView/chat/productPayload";

export function initToolCallRenderers(): void {
  registerToolCallRenderers([
    {
      toolName: ASK_QUESTION_TOOL_NAME,
      renderer: AskQuestionRenderer,
    },
    {
      toolName: OPENAI_IMAGE_RENDERER_KEY,
      renderer: OpenAIImageResultRenderer,
    },
    {
      toolName: SUBAGENT_RESEARCH_RENDERER_KEY,
      renderer: SubAgentResearchRenderer,
    },
    {
      toolName: VL_PRODUCT_RENDERER_KEY,
      renderer: VLProductRenderer,
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
    {
      toolName: "get_calendar_dashboard",
      renderer: CalendarQueryRenderer,
    },
    {
      toolName: "query_calendar_groups",
      renderer: CalendarQueryRenderer,
    },
    {
      toolName: "get_calendar_group_detail",
      renderer: CalendarQueryRenderer,
    },
    {
      toolName: "query_calendars",
      renderer: CalendarQueryRenderer,
    },
    {
      toolName: "get_calendar_detail",
      renderer: CalendarQueryRenderer,
    },
    {
      toolName: "query_calendar_events",
      renderer: CalendarQueryRenderer,
    },
    {
      toolName: "get_calendar_event_detail",
      renderer: CalendarQueryRenderer,
    },
    {
      toolName: "get_events_by_dates",
      renderer: CalendarQueryRenderer,
    },
    {
      toolName: "get_events_by_date_range",
      renderer: CalendarQueryRenderer,
    },
    {
      toolName: "create_calendar_group",
      renderer: CalendarOperationRenderer,
    },
    {
      toolName: "update_calendar_group",
      renderer: CalendarOperationRenderer,
    },
    {
      toolName: "delete_calendar_group",
      renderer: CalendarOperationRenderer,
    },
    {
      toolName: "create_calendar",
      renderer: CalendarOperationRenderer,
    },
    {
      toolName: "update_calendar",
      renderer: CalendarOperationRenderer,
    },
    {
      toolName: "archive_calendar",
      renderer: CalendarOperationRenderer,
    },
    {
      toolName: "toggle_calendar_visibility",
      renderer: CalendarOperationRenderer,
    },
    {
      toolName: "delete_calendar",
      renderer: CalendarOperationRenderer,
    },
    {
      toolName: "merge_calendars",
      renderer: CalendarOperationRenderer,
    },
    {
      toolName: "create_calendar_event",
      renderer: CalendarOperationRenderer,
    },
    {
      toolName: "update_calendar_event",
      renderer: CalendarOperationRenderer,
    },
    {
      toolName: "delete_calendar_event",
      renderer: CalendarOperationRenderer,
    },
    {
      toolName: "question-query",
      renderer: QuestionQueryRenderer,
    },
    {
      toolName: "question-mutation",
      renderer: QuestionOperationRenderer,
    },
    {
      toolName: "structured-tool-result",
      renderer: StructuredToolResultRenderer,
    },
    {
      toolName: "search_knowledge",
      renderer: KnowledgeSearchRenderer,
    },
    {
      toolName: "knowledge-search",
      renderer: KnowledgeSearchRenderer,
    },
    {
      toolName: "content-edit-proposal",
      renderer: ContentEditProposalRenderer,
    },
    {
      toolName: "apply_content_edit_operations",
      renderer: ContentEditProposalRenderer,
    },
    {
      toolName: "replace_content_by_text",
      renderer: ContentEditProposalRenderer,
    },
    {
      toolName: "rewrite_content_full",
      renderer: ContentEditProposalRenderer,
    },
  ]);
}
