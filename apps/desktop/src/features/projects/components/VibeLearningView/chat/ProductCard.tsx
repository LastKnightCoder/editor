/**
 * 对话里的产物卡片（vibe_learning_generate / save_note 的结果）：
 * 产物图标 + 标题 + 实时状态（订阅后台任务），一键在阅读区打开。
 * 任务状态只在本次运行内保留，重启后只显示「已创建」，打开仍可用。
 */

import { Loader2, PenLine } from "lucide-react";
import { Button, cn } from "@tau/ui";
import type { ToolCallCustomRendererProps } from "@/tool-call-renderers/types";
import { ToolCard } from "@/tool-call-renderers/ui";
import { GENERATE_APPS } from "../appMeta";
import { useVLTaskStore, type VLOpenTarget, type VLTask } from "../tasks/store";
import { VL_PRODUCT_RENDERER_KEY, type VLProductPayload } from "./productPayload";

const getPayload = (metadata?: Record<string, unknown>): VLProductPayload | null => {
  const render = metadata?.render as
    { rendererKey?: string; payload?: VLProductPayload } | undefined;
  return render?.rendererKey === VL_PRODUCT_RENDERER_KEY && render.payload ? render.payload : null;
};

function statusLine(payload: VLProductPayload, task: VLTask | undefined) {
  if (payload.mode === "save") return { text: "已保存到产物列表", tone: "muted" as const };
  if (!task) return { text: "已创建", tone: "muted" as const };
  switch (task.status) {
    case "running":
      return {
        text: task.progress
          ? `${task.phase} ${task.progress.done}/${task.progress.total}`
          : task.phase,
        tone: "running" as const,
      };
    case "succeeded":
      return { text: "已生成", tone: "ok" as const };
    case "cancelled":
      return { text: "已停止", tone: "muted" as const };
    case "failed":
      return { text: task.error || "生成失败", tone: "danger" as const };
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
  const payload = getPayload(execution.metadata);
  const task = useVLTaskStore(s => (payload?.taskId ? s.tasks[payload.taskId] : undefined));
  const requestOpen = useVLTaskStore(s => s.requestOpen);
  if (execution.status !== "success" || !payload) return renderDefault();

  const app = GENERATE_APPS.find(a => a.key === payload.kind);
  const Icon = app?.icon ?? PenLine;
  const kindLabel = app?.label ?? "笔记";
  const status = statusLine(payload, task);
  const target = openTarget(payload, task);
  const actionLabel =
    target?.kind === "quiz" ? "开始测验" : target?.kind === "task" ? "查看过程" : "打开";

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
