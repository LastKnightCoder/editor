import { Modal } from "antd";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { ToolCallExecutionState } from "@/types";
import ToolCallDisplay from "@/layouts/ContentLayout/components/ChatSidebar/MessageItem/ToolCallDisplay";
import ReasoningDisplay from "@/layouts/ContentLayout/components/ChatSidebar/MessageItem/ReasoningDisplay";
import MarkdownRenderer from "@/layouts/ContentLayout/components/ChatSidebar/MarkdownRenderer";
import { MarkdownProvider } from "@/layouts/ContentLayout/components/ChatSidebar/MarkdownContext";
import messageItemStyles from "@/layouts/ContentLayout/components/ChatSidebar/MessageItem/index.module.less";
import {
  SUBAGENT_RESEARCH_RENDERER_KEY,
  type SubAgentResearchPayload,
  type SubAgentTaskView,
} from "@/agent/subagentResearch";
import { subAgentResearchStore } from "@/agent/subagentResearchStore";
import type { ToolCallCustomRendererProps } from "./types";
import {
  ToolBadge,
  ToolCard,
  ToolCardBody,
  ToolCardHeader,
  ToolMutedText,
  ToolSectionTitle,
  ToolValuePill,
} from "./ui";

const getPayload = (metadata?: Record<string, unknown>): SubAgentResearchPayload | null => {
  const render =
    metadata?.render && typeof metadata.render === "object"
      ? (metadata.render as Record<string, unknown>)
      : null;
  if (!render || render.rendererKey !== SUBAGENT_RESEARCH_RENDERER_KEY) {
    return null;
  }
  const payload =
    render.payload && typeof render.payload === "object"
      ? (render.payload as SubAgentResearchPayload)
      : null;
  if (!payload || !Array.isArray(payload.tasks)) {
    return null;
  }
  return payload;
};

const statusLabel: Record<string, string> = {
  pending: "等待中",
  running: "调研中",
  success: "已完成",
  partial_success: "部分完成",
  failed: "失败",
  cancelled: "已取消",
};

const getSessionId = (payload: SubAgentResearchPayload | null) => payload?.sessionId || "";

const useLivePayload = (payload: SubAgentResearchPayload | null) => {
  const sessionId = getSessionId(payload);
  const livePayload = useSyncExternalStore(
    listener =>
      sessionId ? subAgentResearchStore.subscribe(sessionId, listener) : () => undefined,
    () => (sessionId ? subAgentResearchStore.getSession(sessionId) : undefined),
    () => undefined
  );
  return livePayload || payload;
};

const formatDuration = (duration?: number) => {
  if (!duration) {
    return "-";
  }
  return `${Math.round(duration / 1000)}s`;
};

const getTaskDuration = (task: SubAgentTaskView, now: number) => {
  if (typeof task.duration === "number") {
    return task.duration;
  }
  if (task.status === "running" && typeof task.startedAt === "number") {
    return Math.max(0, now - task.startedAt);
  }
  return undefined;
};

const StatusBadge = ({ status, isDark }: { status: string; isDark: boolean }) => (
  <ToolBadge isDark={isDark}>{statusLabel[status] || status}</ToolBadge>
);

const ToolExecutionList = ({
  executions,
  isDark,
  markdownComponents,
}: {
  executions: ToolCallExecutionState[];
  isDark: boolean;
  markdownComponents: any;
}) => {
  if (executions.length === 0) {
    return <ToolMutedText isDark={isDark}>未调用工具。</ToolMutedText>;
  }

  return (
    <div className="space-y-2">
      {executions.map(execution => (
        <ToolCallDisplay
          key={execution.toolCallId}
          execution={execution}
          isDark={isDark}
          markdownComponents={markdownComponents}
        />
      ))}
    </div>
  );
};

const TaskTabs = ({
  tasks,
  activeTaskId,
  onChange,
  isDark,
}: {
  tasks: SubAgentTaskView[];
  activeTaskId: string;
  onChange: (taskId: string) => void;
  isDark: boolean;
}) => (
  <div
    role="tablist"
    data-testid="subagent-tabs"
    aria-label="SubAgent 任务"
    className={`flex max-h-28 shrink-0 flex-wrap gap-2 overflow-y-auto rounded-2xl p-2 ${
      isDark ? "bg-zinc-950/70" : "bg-slate-100"
    }`}
  >
    {tasks.map(task => {
      const active = task.id === activeTaskId;
      return (
        <button
          key={task.id}
          type="button"
          role="tab"
          aria-selected={active}
          className={`inline-flex max-w-[220px] shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition-colors ${
            active
              ? isDark
                ? "bg-slate-100 text-slate-950 shadow"
                : "bg-white text-slate-900 shadow-sm"
              : isDark
                ? "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                : "text-slate-500 hover:bg-white/60 hover:text-slate-800"
          }`}
          onClick={() => onChange(task.id)}
        >
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${
              task.status === "success"
                ? "bg-status-success"
                : task.status === "failed"
                  ? "bg-status-error"
                  : task.status === "cancelled"
                    ? "bg-gray-400"
                    : "bg-status-info"
            }`}
          />
          <span className="truncate">{task.title}</span>
        </button>
      );
    })}
  </div>
);

const TaskOutputBlocks = ({
  task,
  isDark,
  markdownComponents,
  now,
}: {
  task: SubAgentTaskView;
  isDark: boolean;
  markdownComponents: any;
  now: number;
}) => {
  const reasoning = task.reasoning || task.reasoningPreview || "";
  const textContent = task.answer || task.progressText || "";
  const duration = getTaskDuration(task, now);
  const hasOutput =
    reasoning.trim().length > 0 || textContent.trim().length > 0 || task.toolExecutions.length > 0;

  return (
    <div
      className={`space-y-3 rounded-xl border p-4 ${
        isDark ? "border-white/10 bg-zinc-950/40" : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <div
          className={`min-w-0 flex-1 text-sm font-semibold ${
            isDark ? "text-slate-100" : "text-slate-800"
          }`}
        >
          {task.title}
        </div>
        <StatusBadge status={task.status} isDark={isDark} />
        <ToolBadge isDark={isDark}>耗时 {formatDuration(duration)}</ToolBadge>
      </div>

      <div>
        <ToolMutedText isDark={isDark}>任务 Prompt</ToolMutedText>
        <pre
          data-testid="subagent-prompt"
          className={`mt-1 max-h-48 whitespace-pre-wrap break-words rounded p-3 text-xs ${
            isDark ? "bg-zinc-900 text-slate-300" : "bg-slate-50 text-slate-600"
          }`}
        >
          {task.prompt}
        </pre>
      </div>

      {task.error ? (
        <div className="rounded bg-red-500/10 p-3 text-sm text-red-500">{task.error}</div>
      ) : null}

      {hasOutput ? (
        <div className="space-y-3">
          {reasoning.trim() ? (
            <ReasoningDisplay
              content={reasoning}
              isDark={isDark}
              markdownComponents={markdownComponents}
              isVisible
            />
          ) : null}

          <ToolExecutionList
            executions={task.toolExecutions as ToolCallExecutionState[]}
            isDark={isDark}
            markdownComponents={markdownComponents}
          />

          {textContent.trim() ? (
            <MarkdownRenderer
              content={textContent}
              className={messageItemStyles.markdown}
              markdownComponents={markdownComponents}
              shouldRender
            />
          ) : null}
        </div>
      ) : (
        <ToolMutedText isDark={isDark}>暂无输出。</ToolMutedText>
      )}
    </div>
  );
};

const SubAgentResearchRenderer = ({
  execution,
  isDark,
  rendererContext,
  renderDefault,
}: ToolCallCustomRendererProps) => {
  const initialPayload = useMemo(() => getPayload(execution.metadata), [execution.metadata]);
  const payload = useLivePayload(initialPayload);
  const [detailOpen, setDetailOpen] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState("");
  const [now, setNow] = useState(Date.now());
  const tasks = payload?.tasks || [];
  const activeTask = tasks.find(task => task.id === activeTaskId) || tasks[0];
  const markdownComponents = rendererContext?.markdownComponents || {};

  useEffect(() => {
    if (!activeTaskId && tasks[0]) {
      setActiveTaskId(tasks[0].id);
      return;
    }

    if (activeTaskId && !tasks.some(task => task.id === activeTaskId)) {
      setActiveTaskId(tasks[0]?.id || "");
    }
  }, [activeTaskId, tasks]);

  useEffect(() => {
    if (!tasks.some(task => task.status === "running")) {
      return;
    }
    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [tasks]);

  if (!payload) {
    return <>{renderDefault()}</>;
  }

  const successCount = payload.tasks.filter(task => task.status === "success").length;
  const failedCount = payload.tasks.filter(task => task.status === "failed").length;
  const cancelledCount = payload.tasks.filter(task => task.status === "cancelled").length;
  const runningCount = payload.tasks.filter(task => task.status === "running").length;

  return (
    <>
      <ToolCard isDark={isDark}>
        <ToolCardHeader isDark={isDark} divided>
          <ToolSectionTitle
            isDark={isDark}
            action={<StatusBadge status={payload.status} isDark={isDark} />}
          >
            SubAgent 调研
          </ToolSectionTitle>
          <ToolMutedText isDark={isDark} className="mt-1">
            {payload.tasks.length} 个子任务，{runningCount} 个进行中。
          </ToolMutedText>
        </ToolCardHeader>
        <ToolCardBody>
          <div className="flex flex-wrap gap-2">
            <ToolValuePill isDark={isDark}>完成：{successCount}</ToolValuePill>
            <ToolValuePill isDark={isDark}>失败：{failedCount}</ToolValuePill>
            <ToolValuePill isDark={isDark}>取消：{cancelledCount}</ToolValuePill>
          </div>
          <div className="space-y-2">
            {payload.tasks.map(task => (
              <div
                key={task.id}
                className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 ${
                  isDark ? "border-white/10 bg-zinc-950/40" : "border-slate-200 bg-slate-50"
                }`}
              >
                <div
                  className={`min-w-0 flex-1 truncate text-sm ${
                    isDark ? "text-slate-200" : "text-slate-700"
                  }`}
                >
                  {task.title}
                </div>
                <ToolBadge isDark={isDark}>{formatDuration(getTaskDuration(task, now))}</ToolBadge>
                <StatusBadge status={task.status} isDark={isDark} />
              </div>
            ))}
          </div>
          <button
            type="button"
            className={`inline-flex rounded-full border px-4 py-2 text-xs font-semibold transition-colors ${
              isDark
                ? "border-[var(--th-info)]/40 bg-[var(--th-info)]/10 hover:bg-[var(--th-info)]/15"
                : "border-[var(--th-info)]/30 bg-[var(--th-info)]/10 text-status-info hover:bg-[var(--th-info)]/15"
            }`}
            onClick={() => setDetailOpen(true)}
          >
            查看详情
          </button>
        </ToolCardBody>
      </ToolCard>

      <Modal
        title="SubAgent 执行详情"
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={null}
        width={860}
        destroyOnHidden
      >
        <MarkdownProvider isDark={isDark} isVisible>
          <div className="flex max-h-[70vh] flex-col gap-4">
            <TaskTabs
              tasks={payload.tasks}
              activeTaskId={activeTask?.id || ""}
              onChange={setActiveTaskId}
              isDark={isDark}
            />

            <div data-testid="subagent-scroll-body" className="min-h-0 flex-1 overflow-auto pr-1">
              {activeTask ? (
                <TaskOutputBlocks
                  task={activeTask}
                  isDark={isDark}
                  markdownComponents={markdownComponents}
                  now={now}
                />
              ) : (
                <ToolMutedText isDark={isDark}>暂无 SubAgent 任务。</ToolMutedText>
              )}
            </div>
          </div>
        </MarkdownProvider>
      </Modal>
    </>
  );
};

export default SubAgentResearchRenderer;
