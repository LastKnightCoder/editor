import {
  notebookTranslator,
  useNotebookI18n,
  notebookTaskPhase,
  notebookTaskError,
} from "@/features/vibe-learning/i18n";
/**
 * 对话里的产物卡片（vibe_learning_generate / save_note 的结果）：
 * 产物图标 + 标题 + 实时状态（订阅后台任务），一键在阅读区打开。
 * 任务状态只在本次运行内保留，重启后只显示「已创建」，打开仍可用。
 */

import { Loader2, PenLine } from "lucide-react";
import { Button, cn } from "@tau/ui";
import type { ToolCallCustomRendererProps } from "@/tool-call-renderers/types";
import { ToolCard } from "@tau/chat-ui";
import { GENERATE_APPS } from "../appMeta";
import { useVLTaskStore, type VLOpenTarget, type VLTask } from "../tasks/store";
import { VL_PRODUCT_RENDERER_KEY, type VLProductPayload } from "./productPayload";
const t = notebookTranslator.t;

const getPayload = (metadata?: Record<string, unknown>): VLProductPayload | null => {
  const render = metadata?.render as
    | { rendererKey?: string; payload?: VLProductPayload }
    | undefined;
  return render?.rendererKey === VL_PRODUCT_RENDERER_KEY && render.payload ? render.payload : null;
};

function statusLine(payload: VLProductPayload, task: VLTask | undefined) {
  if (payload.mode === "save") return { text: t("product.saved"), tone: "muted" as const };
  if (!task) return { text: t("common.created"), tone: "muted" as const };
  switch (task.status) {
    case "running":
      return {
        text: task.progress
          ? `${notebookTaskPhase(task)} ${task.progress.done}/${task.progress.total}`
          : notebookTaskPhase(task),
        tone: "running" as const,
      };
    case "succeeded":
      return { text: t("common.generated"), tone: "ok" as const };
    case "cancelled":
      return { text: t("common.stopped"), tone: "muted" as const };
    case "failed":
      return { text: notebookTaskError(task), tone: "danger" as const };
  }
}

function openTarget(payload: VLProductPayload, task: VLTask | undefined): VLOpenTarget | null {
  if (payload.noteId) return { kind: "note", id: payload.noteId };
  if (payload.quizSetId) {
    // 测验：生成中看过程，生成好了直接开始测验
    if (task && task.status !== "succeeded" && payload.taskId)
      return { kind: "task", id: payload.taskId };
    return { kind: "quiz", id: payload.quizSetId };
  }
  return payload.taskId ? { kind: "task", id: payload.taskId } : null;
}

const VLProductRenderer = ({ execution, renderDefault }: ToolCallCustomRendererProps) => {
  useNotebookI18n();
  const payload = getPayload(execution.metadata);
  const task = useVLTaskStore(s => (payload?.taskId ? s.tasks[payload.taskId] : undefined));
  const requestOpen = useVLTaskStore(s => s.requestOpen);
  if (execution.status !== "success" || !payload) return renderDefault();

  const app = GENERATE_APPS.find(a => a.key === payload.kind);
  const Icon = app?.icon ?? PenLine;
  const kindLabel = app?.label ?? t("kind.note");
  const status = statusLine(payload, task);
  const target = openTarget(payload, task);
  const actionLabel =
    target?.kind === "quiz"
      ? t("stage.startQuiz")
      : target?.kind === "task"
        ? t("product.process")
        : t("common.open");

  return (
    <ToolCard>
      <div className="flex items-center gap-3 px-3.5 py-3">
        <span className="bg-hover text-ink-2 grid size-9 shrink-0 place-items-center rounded-[10px]">
          <Icon className="size-4" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-tau-body text-ink-1 truncate font-semibold">
            {task?.title ?? payload.title}
          </div>
          <div
            className={cn(
              "text-tau-sm mt-0.5 flex min-w-0 items-center gap-1.5",
              status.tone === "danger" ? "text-danger" : "text-ink-3"
            )}
          >
            {status.tone === "running" && (
              <Loader2 className="size-3 shrink-0 animate-spin" strokeWidth={2} />
            )}
            <span className="truncate">
              {kindLabel} · {status.text}
            </span>
          </div>
        </div>
        {target && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => requestOpen(payload.projectId, target)}
          >
            {actionLabel}
          </Button>
        )}
      </div>
    </ToolCard>
  );
};

export default VLProductRenderer;
