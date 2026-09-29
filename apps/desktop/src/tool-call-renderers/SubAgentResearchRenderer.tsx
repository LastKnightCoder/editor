import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { Ban, Check, CircleAlert, Clock, X } from "lucide-react";
import { Button, Dialog, Spinner, cn } from "@tau/ui";
import type { ToolCallExecutionState } from "@/types";
import { ReasoningBlock } from "@/components/ChatUI";
import ToolCallDisplay from "@/components/ChatSidebar/MessageItem/ToolCallDisplay";
import MarkdownRenderer from "@/components/ChatSidebar/MarkdownRenderer";
import { MarkdownProvider } from "@/components/ChatSidebar/MarkdownContext";
import {
  SUBAGENT_RESEARCH_RENDERER_KEY,
  type SubAgentResearchPayload,
  type SubAgentTaskView,
} from "@/agent/subagentResearch";
import { subAgentResearchStore } from "@/agent/subagentResearchStore";
import type { ToolCallCustomRendererProps } from "./types";
import {
  ToolCard,
  ToolCardBody,
  ToolCardHeader,
  ToolDividerList,
  ToolDividerListItem,
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

/** 状态 = 小图标 + 语义色文字（不上彩色实底徽章） */
const statusVisual = (status: string): { icon: ReactNode; className: string } => {
  switch (status) {
    case "running":
      return { icon: <Spinner className="size-3 border-[1.5px]" />, className: "text-ink-2" };
    case "success":
      return { icon: <Check strokeWidth={2} />, className: "text-ok" };
    case "partial_success":
      return { icon: <CircleAlert strokeWidth={1.75} />, className: "text-warn" };
    case "failed":
      return { icon: <X strokeWidth={2} />, className: "text-danger" };
    case "cancelled":
      return { icon: <Ban strokeWidth={1.75} />, className: "text-ink-3" };
    default:
      return { icon: <Clock strokeWidth={1.75} />, className: "text-ink-3" };
  }
};

const StatusIcon = ({ status }: { status: string }) => {
  const visual = statusVisual(status);
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-3.5 shrink-0 items-center justify-center [&_svg]:size-3.5",
        visual.className
      )}
    >
      {visual.icon}
    </span>
  );
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

const StatusBadge = ({ status }: { status: string; isDark: boolean }) => {
  const visual = statusVisual(status);
  return (
    <span className={cn("text-tau-sm inline-flex shrink-0 items-center gap-1", visual.className)}>
      <StatusIcon status={status} />
      {statusLabel[status] || status}
    </span>
  );
};

const DurationText = ({ duration }: { duration?: number }) => (
  <span className="text-tau-sm text-ink-3 shrink-0 tabular-nums">{formatDuration(duration)}</span>
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
    <div className="flex flex-col gap-0.5">
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
    className="flex max-h-28 shrink-0 flex-wrap gap-1 overflow-y-auto"
  >
    {tasks.map(task => {
      const active = task.id === activeTaskId;
      return (
        <button
          key={task.id}
          type="button"
          role="tab"
          aria-selected={active}
          className={cn(
            "text-tau-sm rounded-tau-sm ease-tau-out inline-flex max-w-[220px] shrink-0 items-center gap-1.5 px-2.5 py-1 transition-colors duration-150",
            active ? "bg-selected text-ink-1" : "text-ink-2 hover:bg-hover hover:text-ink-1"
          )}
          onClick={() => onChange(task.id)}
        >
          <StatusIcon status={task.status} />
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="text-tau-title text-ink-1 min-w-0 flex-1 font-semibold">{task.title}</div>
        <StatusBadge status={task.status} isDark={isDark} />
        <span className="text-tau-sm text-ink-3 shrink-0 tabular-nums">
          耗时 {formatDuration(duration)}
        </span>
      </div>

      <div>
        <ToolMutedText isDark={isDark} className="mb-1">
          任务 Prompt
        </ToolMutedText>
        <pre
          data-testid="subagent-prompt"
          className="bg-hover text-ink-2 text-tau-sm rounded-tau-sm m-0 max-h-48 overflow-auto whitespace-pre-wrap break-words px-3 py-2.5 font-[inherit] leading-[1.65]"
        >
          {task.prompt}
        </pre>
      </div>

      {task.error ? (
        <div className="bg-danger-soft text-danger text-tau-sm rounded-tau-sm px-3 py-2.5">
          {task.error}
        </div>
      ) : null}

      {hasOutput ? (
        <div className="space-y-2">
          {reasoning.trim() ? (
            <ReasoningBlock>
              <MarkdownRenderer
                content={reasoning}
                markdownComponents={markdownComponents}
                shouldRender
              />
            </ReasoningBlock>
          ) : null}

          <ToolExecutionList
            executions={task.toolExecutions as ToolCallExecutionState[]}
            isDark={isDark}
            markdownComponents={markdownComponents}
          />

          {textContent.trim() ? (
            <div className="text-tau-body-lg text-ink-1 min-w-0 pt-1 [overflow-wrap:anywhere]">
              <MarkdownRenderer
                content={textContent}
                markdownComponents={markdownComponents}
                shouldRender
              />
            </div>
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
        <ToolCardHeader isDark={isDark}>
          <ToolSectionTitle
            isDark={isDark}
            action={<StatusBadge status={payload.status} isDark={isDark} />}
          >
            SubAgent 调研
          </ToolSectionTitle>
          <ToolMutedText isDark={isDark} className="mt-0.5 tabular-nums">
            {payload.tasks.length} 个子任务，{runningCount} 个进行中。
          </ToolMutedText>
        </ToolCardHeader>
        <ToolCardBody>
          <div className="flex flex-wrap gap-1.5 tabular-nums">
            <ToolValuePill isDark={isDark}>完成：{successCount}</ToolValuePill>
            <ToolValuePill isDark={isDark}>失败：{failedCount}</ToolValuePill>
            <ToolValuePill isDark={isDark}>取消：{cancelledCount}</ToolValuePill>
          </div>
          <ToolDividerList isDark={isDark}>
            {payload.tasks.map(task => (
              <ToolDividerListItem key={task.id} isDark={isDark}>
                <div className="flex items-center gap-2">
                  <StatusIcon status={task.status} />
                  <div className="text-tau-body text-ink-1 min-w-0 flex-1 truncate">
                    {task.title}
                  </div>
                  <DurationText duration={getTaskDuration(task, now)} />
                  <span className="text-tau-sm text-ink-3 w-14 shrink-0 text-right">
                    {statusLabel[task.status] || task.status}
                  </span>
                </div>
              </ToolDividerListItem>
            ))}
          </ToolDividerList>
          <Button size="sm" variant="soft" onClick={() => setDetailOpen(true)}>
            查看详情
          </Button>
        </ToolCardBody>
      </ToolCard>

      <Dialog
        title="SubAgent 执行详情"
        open={detailOpen}
        onOpenChange={setDetailOpen}
        width={860}
        height={760}
      >
        <MarkdownProvider isDark={isDark} isVisible>
          <div className="border-line-2 mt-[14px] flex min-h-0 flex-1 flex-col gap-4 border-t px-6 pb-5 pt-3">
            <TaskTabs
              tasks={payload.tasks}
              activeTaskId={activeTask?.id || ""}
              onChange={setActiveTaskId}
              isDark={isDark}
            />

            <div
              data-testid="subagent-scroll-body"
              className="scrollbar-inset min-h-0 flex-1 overflow-auto pr-1"
            >
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
      </Dialog>
    </>
  );
};

export default SubAgentResearchRenderer;
