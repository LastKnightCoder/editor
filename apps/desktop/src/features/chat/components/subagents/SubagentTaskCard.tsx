import { BellRing, ChevronRight, CornerDownRight, GitFork } from "lucide-react";
import { cn } from "@tau/ui";
import { SubagentInteractions } from "./SubagentInteractions";
import { SubagentActivityLine, SubagentAvatar, SubagentOutcomeLine, SubagentStatus } from "./parts";
import { openSubagentDetail, useNow, useOpenedSubagent } from "./focusStore";
import { errorText, formatElapsed, isActive, needsUser, runElapsed } from "./model";
import type { SubagentItem } from "./useSubagentItems";

/** 子 Agent 行：头像 · 标题 · 耗时 · 状态，第二行活动；点击打开详情 */
export function SubagentRow({
  item,
  selected,
  onOpen,
  now,
  className,
}: {
  item: SubagentItem;
  selected?: boolean;
  onOpen: () => void;
  now: number;
  className?: string;
}) {
  const { view, run, status } = item;
  const elapsed = runElapsed(run, now);
  const live = status === "running" || status === "queued";
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`查看子 Agent「${view.agent.title}」`}
      className={cn(
        "rounded-tau-md ease-tau-out grid w-full grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-0.5 px-2.5 py-2 text-left transition-colors duration-[160ms]",
        selected ? "bg-selected" : "hover:bg-hover",
        className
      )}
    >
      <SubagentAvatar view={view} status={status} />
      <span
        className={cn(
          "text-tau-body min-w-0 truncate",
          status === "completed" ? "text-ink-2" : "text-ink-1 font-medium"
        )}
      >
        {view.agent.title}
      </span>
      <span className="text-tau-micro text-ink-3 flex items-center gap-2">
        {elapsed !== undefined && (
          <span className="tabular-nums @max-[420px]:hidden">{formatElapsed(elapsed)}</span>
        )}
        <SubagentStatus status={status} />
        <ChevronRight size={14} strokeWidth={1.75} className="text-ink-3" />
      </span>
      {live && (
        <SubagentActivityLine
          status={status}
          activity={view.activity}
          className="col-span-2 col-start-2"
        />
      )}
    </button>
  );
}

/** 行下附加：待处理交互直接作答；失败 / 中断给出错误原文。结果正文只在详情里完整渲染 */
function RowExtra({ item, isDark }: { item: SubagentItem; isDark: boolean }) {
  if (needsUser(item.status) && item.interactions)
    return (
      <div className="mt-1.5 mr-2 mb-2 ml-[42px]">
        <SubagentInteractions snapshot={item.interactions} isDark={isDark} />
      </div>
    );
  const error = errorText(item.run);
  if (error)
    return (
      <SubagentOutcomeLine
        tone={item.status === "failed" ? "danger" : "warn"}
        className="mt-1.5 mr-2.5 mb-2 ml-[42px]"
      >
        {error}
      </SubagentOutcomeLine>
    );
  return null;
}

/** 进度条：每个子 Agent 一段，按状态着色 */
function SegmentBar({ items }: { items: SubagentItem[] }) {
  return (
    <span className="bg-track flex h-[3px] w-[120px] gap-0.5 overflow-hidden rounded-full @max-[420px]:w-14">
      {items.map(item => (
        <i
          key={item.view.agent.agentId}
          className={cn(
            "flex-1",
            item.status === "completed"
              ? "bg-ok"
              : needsUser(item.status)
                ? "bg-warn"
                : item.status === "running"
                  ? "bg-accent"
                  : item.status === "failed"
                    ? "bg-danger"
                    : "bg-transparent"
          )}
        />
      ))}
    </span>
  );
}

/** 一次派发（同一条回复里连续的 spawn/send 调用）对应一张卡 */
export function SubagentTaskCard({
  parentScope,
  items,
  kind,
  sync,
  isDark,
}: {
  parentScope: string;
  items: SubagentItem[];
  kind: "spawn" | "send";
  sync: boolean;
  isDark: boolean;
}) {
  const opened = useOpenedSubagent(parentScope);
  const now = useNow(items.some(item => item.status === "running"));
  const attention = items.filter(item => needsUser(item.status)).length;
  const done = items.filter(item => item.status === "completed").length;
  const Icon = kind === "spawn" ? GitFork : CornerDownRight;
  const title = kind === "spawn" ? "派出子任务" : "续派";
  const meta =
    kind === "send"
      ? `交给已有子 Agent · 第 ${items[0]?.view.runs.length ?? 1} 次任务`
      : `${items.length} 个子 Agent · ${sync ? "主 Agent 等待结果" : "异步"}`;
  return (
    <div className="border-line-1 bg-surface rounded-tau-lg @container my-1 overflow-hidden border">
      <div className="text-tau-meta text-ink-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 py-2.5 pr-3 pl-3.5 [&>svg]:size-4">
        <Icon strokeWidth={1.75} />
        <b className="text-tau-body text-ink-1 font-semibold">{title}</b>
        <span className="@max-[420px]:hidden">{meta}</span>
        <span className="flex-1" />
        {attention > 0 ? (
          <span className="text-warn inline-flex items-center gap-[5px] font-medium [&_svg]:size-[13px]">
            <BellRing strokeWidth={1.75} />
            {attention} 个等你处理
          </span>
        ) : items.length > 1 ? (
          <span className="tabular-nums">
            {done}/{items.length} 完成
          </span>
        ) : null}
        {items.length > 1 && <SegmentBar items={items} />}
      </div>
      <div className="flex flex-col px-1 pb-1">
        {items.map(item => (
          <div key={item.view.agent.agentId} className="min-w-0">
            <SubagentRow
              item={item}
              now={now}
              selected={opened === item.view.agent.agentId}
              onOpen={() => openSubagentDetail(parentScope, item.view.agent.agentId)}
            />
            {!isActive(item.status) || needsUser(item.status) ? (
              <RowExtra item={item} isDark={isDark} />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
