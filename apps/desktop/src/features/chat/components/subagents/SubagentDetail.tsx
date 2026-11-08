import { useMemo, useState } from "react";
import { Ban, Check, CircleAlert, CirclePause, CornerDownRight, Info, Square } from "lucide-react";
import { Button, FadeScroll, Segmented, Spinner, cn, toast } from "@tau/ui";
import { cancelSubagentRun } from "@/commands/subagents";
import MessageItem from "@/components/ChatSidebar/MessageItem";
import { MarkdownProvider } from "@/components/ChatSidebar/MarkdownContext";
import { Role } from "@/constants";
import type { SubagentRun } from "@/types/subagent";
import { useSubagentDetail } from "../../subagentQueries";
import { subagentMessages } from "./projection";
import { SubagentInteractions } from "./SubagentInteractions";
import { SubagentActivityLine, SubagentAvatar, SubagentStatus } from "./parts";
import { useNow } from "./focusStore";
import { useSubagentParent } from "./parentContext";
import { errorText, formatElapsed, needsUser, runElapsed } from "./model";
import type { SubagentItem } from "./useSubagentItems";

const markdownComponents = {};

/** 详情头：头像 · 标题 · 状态 / 任务次数 / 耗时；actions 由容器注入（关闭、返回等） */
export function SubagentDetailHeader({
  item,
  actions,
}: {
  item: SubagentItem;
  actions?: React.ReactNode;
}) {
  const now = useNow(item.status === "running");
  const elapsed = runElapsed(item.run, now);
  return (
    <div className="flex items-center gap-2.5 px-4 pt-3.5 pb-3">
      <SubagentAvatar view={item.view} status={item.status} size="lg" />
      <div className="min-w-0 flex-1">
        <div className="text-tau-title text-ink-1 truncate font-semibold">
          {item.view.agent.title}
        </div>
        <div className="text-tau-sm text-ink-3 flex items-center gap-2">
          <SubagentStatus status={item.status} />
          <span>第 {item.view.runs.length} 次任务</span>
          {elapsed !== undefined && <span className="tabular-nums">{formatElapsed(elapsed)}</span>}
        </div>
      </div>
      {actions}
    </div>
  );
}

function TaskBrief({ run }: { run: SubagentRun }) {
  return (
    <div className="bg-page rounded-tau-md text-tau-body text-ink-2 px-3 py-2.5">
      <div className="text-tau-micro text-ink-3 mb-0.5 flex items-center gap-1.5 [&_svg]:size-3">
        <CornerDownRight strokeWidth={1.75} />主 Agent 的任务 ·{" "}
        {run.mode === "sync" ? "同步" : "异步"}
      </div>
      <div className="break-words whitespace-pre-wrap">{run.input}</div>
    </div>
  );
}

function RunOutcome({ run }: { run: SubagentRun }) {
  if (run.status === "completed")
    return (
      <div className="text-tau-sm text-ok flex items-center gap-1.5 font-medium [&_svg]:size-[13px]">
        <Check strokeWidth={2} />
        结果已回传给主 Agent
      </div>
    );
  if (run.status === "cancelled")
    return (
      <Notice tone="warn" icon={<Ban strokeWidth={1.75} />} title="已取消">
        会话和历史仍保留。
      </Notice>
    );
  const error = errorText(run);
  if (!error) return null;
  return run.status === "interrupted" ? (
    <Notice tone="warn" icon={<CirclePause strokeWidth={1.75} />} title="已中断">
      {error}。会话历史保留，主 Agent 再次发送即可继续。
    </Notice>
  ) : (
    <Notice tone="danger" icon={<CircleAlert strokeWidth={1.75} />} title="执行失败">
      {error}
    </Notice>
  );
}

function Notice({
  tone,
  icon,
  title,
  children,
}: {
  tone: "warn" | "danger";
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role={tone === "danger" ? "alert" : undefined}
      className={cn(
        "rounded-tau-md text-tau-meta flex gap-2 px-3 py-2.5 [&>svg]:mt-[3px] [&>svg]:size-3.5 [&>svg]:shrink-0",
        tone === "danger" ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn"
      )}
    >
      {icon}
      <div className="min-w-0">
        <b className="font-semibold">{title}</b>
        <div className="text-ink-1 break-words">{children}</div>
      </div>
    </div>
  );
}

function RunsList({ runs, now }: { runs: SubagentRun[]; now: number }) {
  return (
    <div className="flex flex-col">
      {[...runs].reverse().map((run, index) => {
        const elapsed = runElapsed(run, now);
        return (
          <div
            key={run.runId}
            className="border-line-2 text-tau-meta grid grid-cols-[28px_1fr_auto] gap-x-2.5 gap-y-1 border-b py-2.5 last:border-b-0"
          >
            <span className="text-tau-micro text-ink-3 tabular-nums">#{runs.length - index}</span>
            <SubagentStatus status={run.status} />
            <span className="text-tau-micro text-ink-3 tabular-nums">
              {run.mode === "sync" ? "同步" : "异步"}
              {elapsed !== undefined && ` · ${formatElapsed(elapsed)}`}
            </span>
            <span className="text-ink-1 col-span-2 col-start-2 line-clamp-3 break-words">
              {run.input}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * 子会话正文：对话（任务说明 → 历史与当前响应 → 待处理交互 / 结果）与执行记录两页，
 * 底栏提供停止当前执行或取消排队。抽屉与栏内下钻共用。
 */
export function SubagentDetailBody({ item, isDark }: { item: SubagentItem; isDark: boolean }) {
  const agentId = item.view.agent.agentId;
  const query = useSubagentDetail(agentId, useSubagentParent());
  const [tab, setTab] = useState<"talk" | "runs">("talk");
  const [cancelling, setCancelling] = useState(false);
  const now = useNow(item.status === "running");
  const messages = useMemo(
    () => (query.data ? subagentMessages(query.data, item.interactions) : []),
    [query.data, item.interactions]
  );
  const run = item.run;
  const active = item.view.runs.filter(r => r.status === "running" || r.status === "queued");
  const stoppable = active.find(r => r.status === "running") ?? active[0];
  const stop = async () => {
    if (!stoppable || cancelling) return;
    setCancelling(true);
    try {
      await cancelSubagentRun(agentId, stoppable.runId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "取消子 Agent 执行失败");
    } finally {
      setCancelling(false);
    }
  };
  // 历史里的「用户消息」是主 Agent 下发的任务；尚未开始执行时历史为空，单独显示任务说明
  const showBrief = !messages.some(message => message.role === Role.User);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-4 pb-2">
        <Segmented label="详情内容" value={tab} onValueChange={setTab}>
          <Segmented.Item value="talk" label="对话" />
          <Segmented.Item value="runs" label={`执行记录 ${item.view.runs.length}`} />
        </Segmented>
      </div>
      {/* 透明右边加宽到 10px，滚动条离抽屉圆角外框留出呼吸；右内边距 = 16px 减 10px */}
      <FadeScroll className="border-t-line-2 flex min-h-0 flex-1 flex-col gap-3 border-t border-r-[10px] pt-3.5 pr-1.5 pb-4 pl-4">
        {tab === "runs" ? (
          <RunsList runs={item.view.runs} now={now} />
        ) : (
          <>
            {run && showBrief && <TaskBrief run={run} />}
            {query.isPending && <Spinner />}
            {query.isError && (
              <div role="alert" className="text-tau-meta text-danger flex items-center gap-2">
                子 Agent 记录读取失败：{query.error.message}
                <Button size="sm" variant="ghost" onClick={() => void query.refetch()}>
                  重新读取
                </Button>
              </div>
            )}
            <MarkdownProvider isDark={isDark} isVisible>
              {messages.map((message, index) => (
                <MessageItem
                  key={index}
                  message={message}
                  messageIndex={index}
                  isDark={isDark}
                  isVisible
                  markdownComponents={markdownComponents}
                />
              ))}
            </MarkdownProvider>
            {needsUser(item.status) && item.interactions && (
              <SubagentInteractions snapshot={item.interactions} isDark={isDark} />
            )}
            {(item.status === "running" || item.status === "queued") && (
              <SubagentActivityLine status={item.status} activity={item.view.activity} />
            )}
            {run && run.status !== "running" && run.status !== "queued" && <RunOutcome run={run} />}
          </>
        )}
      </FadeScroll>
      <div className="border-line-2 text-tau-sm text-ink-3 flex flex-none items-center gap-2 border-t px-3.5 py-2.5 [&>svg]:size-3.5">
        <Info strokeWidth={1.75} />
        <span className="min-w-0 truncate">子 Agent 只接收主 Agent 的指令</span>
        <span className="flex-1" />
        {stoppable && (
          <Button
            size="sm"
            variant="danger-soft"
            icon={Square}
            disabled={cancelling}
            onClick={() => void stop()}
          >
            {stoppable.status === "queued" ? "取消排队" : "停止执行"}
          </Button>
        )}
      </div>
    </div>
  );
}
