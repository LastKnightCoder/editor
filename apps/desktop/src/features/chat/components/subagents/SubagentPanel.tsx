import { useEffect, useState } from "react";
import { BellRing, ChevronDown, ChevronLeft, Locate } from "lucide-react";
import { Drawer, FadeScroll, IconButton, Popover, Spinner, cn, useRetainedValue } from "@tau/ui";
import { useOverlayDismiss } from "@/page/PageProvider";
import { SubagentDetailBody, SubagentDetailHeader } from "./SubagentDetail";
import { SubagentAvatar, SubagentAvatarStack } from "./parts";
import { SubagentRow } from "./SubagentTaskCard";
import {
  SUBAGENT_DRAWER_MIN_W,
  openSubagentDetail,
  useNow,
  useOpenedSubagent,
  useSubagentDrawerWidth,
} from "./focusStore";
import { isActive, needsUser } from "./model";
import { useSubagentItems, type SubagentItem } from "./useSubagentItems";
import type { SubagentParentRef } from "@/types/subagent";

const GROUPS = [
  { title: "等你处理", match: (item: SubagentItem) => needsUser(item.status) },
  {
    title: "工作中",
    match: (item: SubagentItem) => item.status === "running" || item.status === "queued",
  },
  { title: "已结束", match: (item: SubagentItem) => !isActive(item.status) },
];

/** 对话顶部常驻入口：本会话全部子 Agent 的汇总胶囊，点开分组列表，再点一行进详情 */
export function SubagentHub({
  parent,
  compact,
  onLocate,
}: {
  parent: SubagentParentRef;
  compact?: boolean;
  /** 滚动到派发该子 Agent 的消息 */
  onLocate?: (agentId: string) => void;
}) {
  const parentScope = parent.scope;
  const { items } = useSubagentItems(parent);
  const [open, setOpen] = useState(false);
  const now = useNow(open && items.some(item => item.status === "running"));
  if (!items.length) return null;
  const attention = items.filter(item => needsUser(item.status)).length;
  const working = items.filter(
    item => item.status === "running" || item.status === "queued"
  ).length;
  const label = attention
    ? `${attention} 个等你处理`
    : working
      ? `${working} 个子 Agent 工作中`
      : `${items.length} 个子 Agent · 已结束`;
  const ring = attention ? "border-warn-soft" : "border-page";
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      placement="bottom-end"
      arrow={false}
      className="flex max-h-[560px] w-[min(380px,calc(100vw-32px))] max-w-none flex-col p-1.5"
      trigger={
        <button
          type="button"
          title={label}
          aria-label={`子 Agent：${label}`}
          className={cn(
            "text-tau-sm ease-tau-out flex h-7 items-center gap-[7px] rounded-full pr-2.5 pl-[5px] whitespace-nowrap transition-colors duration-[160ms]",
            attention
              ? "bg-warn-soft text-warn font-medium"
              : "bg-page text-ink-2 hover:bg-press hover:text-ink-1 aria-expanded:bg-press"
          )}
        >
          <SubagentAvatarStack
            views={items.map(item => item.view)}
            ring={ring}
            max={compact ? 3 : 5}
          />
          {attention ? (
            <BellRing size={13} strokeWidth={1.75} />
          ) : working ? (
            <Spinner className="size-3 border-[1.5px]" />
          ) : null}
          {compact ? (
            <span className="tabular-nums">{attention || working || items.length}</span>
          ) : (
            <span>{label}</span>
          )}
          <ChevronDown size={13} strokeWidth={1.75} className="text-ink-3" />
        </button>
      }
    >
      <div className="text-tau-sm text-ink-3 flex items-center gap-2 px-2 pt-1.5 pb-2">
        <b className="text-tau-meta text-ink-1 font-semibold">本对话的子 Agent</b>
        <span className="tabular-nums">{items.length}</span>
      </div>
      <FadeScroll className="flex min-h-0 flex-col border-r-[3px]">
        {GROUPS.map(group => {
          const list = items.filter(group.match);
          if (!list.length) return null;
          return (
            <div key={group.title} className="flex flex-col">
              <div className="text-tau-micro text-ink-3 px-2.5 pt-2 pb-1">
                {group.title} · {list.length}
              </div>
              {list.map(item => (
                <div key={item.view.agent.agentId} className="group/hub relative min-w-0">
                  <SubagentRow
                    item={item}
                    now={now}
                    className={cn(needsUser(item.status) && "bg-warn-soft/70")}
                    onOpen={() => {
                      setOpen(false);
                      openSubagentDetail(parentScope, item.view.agent.agentId);
                    }}
                  />
                  {onLocate && (
                    <IconButton
                      title="定位到派发消息"
                      aria-label="定位到派发消息"
                      className="bg-surface absolute top-1.5 right-[118px] size-6 opacity-0 transition-opacity group-hover/hub:opacity-100 focus-visible:opacity-100 [&_svg]:size-3.5"
                      onClick={() => {
                        setOpen(false);
                        onLocate(item.view.agent.agentId);
                      }}
                    >
                      <Locate strokeWidth={1.75} />
                    </IconButton>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </FadeScroll>
    </Popover>
  );
}

/**
 * 详情容器：对话页为右侧非模态抽屉，辅助栏（compact）为栏内下钻、覆盖对话并可返回。
 * 打开哪个子 Agent 由 focusStore 按父会话记录。
 */
export function SubagentDetailLayer({
  parent,
  compact,
  isDark,
}: {
  parent: SubagentParentRef;
  compact?: boolean;
  isDark: boolean;
}) {
  const parentScope = parent.scope;
  const { items } = useSubagentItems(parent);
  const openedId = useOpenedSubagent(parentScope);
  const opened = items.find(item => item.view.agent.agentId === openedId) ?? null;
  const shown = useRetainedValue(opened);
  const close = () => openSubagentDetail(parentScope, null);
  const drawerWidth = useSubagentDrawerWidth(state => state.width);
  const setDrawerWidth = useSubagentDrawerWidth(state => state.setWidth);
  const [containerWidth, setContainerWidth] = useState(960);
  const [panel, setPanel] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const container = panel?.parentElement;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width));
    observer.observe(container);
    return () => observer.disconnect();
  }, [panel]);
  useOverlayDismiss(close, Boolean(opened));
  const peers =
    items.length > 1 ? (
      <div className="flex items-center gap-0.5">
        {items.map(item => (
          <button
            key={item.view.agent.agentId}
            type="button"
            title={item.view.agent.title}
            aria-label={`切换到「${item.view.agent.title}」`}
            aria-pressed={item.view.agent.agentId === openedId}
            onClick={() => openSubagentDetail(parentScope, item.view.agent.agentId)}
            className="hover:bg-hover aria-pressed:bg-selected grid size-[26px] place-items-center rounded-[8px]"
          >
            <SubagentAvatar view={item.view} status={item.status} size="xs" />
          </button>
        ))}
      </div>
    ) : null;

  if (compact) {
    if (!opened) return null;
    return (
      <div
        role="dialog"
        aria-label={`子 Agent「${opened.view.agent.title}」`}
        className="bg-surface rounded-tau-lg animate-subagent-drill-in absolute inset-0 z-20 flex flex-col overflow-hidden motion-reduce:animate-none"
      >
        <div className="border-line-2 flex h-11 flex-none items-center gap-1 border-b pr-2 pl-1.5">
          <button
            type="button"
            onClick={close}
            className="text-tau-meta text-ink-2 hover:bg-hover hover:text-ink-1 flex h-7 items-center gap-1 rounded-[8px] pr-2 pl-1"
          >
            <ChevronLeft size={16} strokeWidth={1.75} />
            返回对话
          </button>
          <span className="flex-1" />
          {peers}
        </div>
        <SubagentDetailHeader item={opened} />
        <SubagentDetailBody item={opened} isDark={isDark} />
      </div>
    );
  }

  return (
    <Drawer
      open={Boolean(opened)}
      onOpenChange={next => !next && close()}
      modal={false}
      fill
      width={drawerWidth}
      onWidthChange={setDrawerWidth}
      minWidth={SUBAGENT_DRAWER_MIN_W}
      // 抽屉在对话容器内定位，最宽留出左侧一窄条对话，便于点回任务卡
      maxWidth={Math.max(SUBAGENT_DRAWER_MIN_W, containerWidth - 120)}
      label={shown ? `子 Agent「${shown.view.agent.title}」` : "子 Agent"}
      closeLabel="关闭子 Agent 详情"
      className="z-20"
      ref={setPanel}
    >
      {shown && (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* 右侧留出 Drawer 自带关闭按钮的位置 */}
          <div className="pr-9">
            <SubagentDetailHeader item={shown} />
          </div>
          {peers && <div className="px-3.5 pb-2">{peers}</div>}
          <SubagentDetailBody item={shown} isDark={isDark} />
        </div>
      )}
    </Drawer>
  );
}
