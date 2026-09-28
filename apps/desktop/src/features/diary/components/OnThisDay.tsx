/**
 * 那年今日（D-044 三轮定稿）：不进流，只在输入条正上方露一行预告；点开从纸右侧滑出抽屉瞥一眼。
 *  - OnThisDayTease：「↺ 一年前的今天 · 首句 · 还有 N 条 ×」，× = 今天不再提示；
 *  - OnThisDayDrawer：按年份列出当天全部条目，点一条 = 关抽屉并跳到流里那一条。
 * 抽屉盖在纸上不挤压（同闪卡 ReferenceDrawer 形制），Esc 走 D-003 浮层注册表。
 */

import { useEffect, useState } from "react";
import { getContentKit } from "@/services/editorKit";
import { History, X } from "lucide-react";
import { Editor } from "@tau/editor/src";
import { IconButton, Tag, cn, useEdgeFade } from "@tau/ui";
import ErrorBoundary from "@/components/ErrorBoundary";
import { useOverlayDismiss } from "@/page/PageProvider";
import {
  firstLine,
  formatTime,
  keyDate,
  weekdayOf,
  type DiaryMoment,
  type DiaryTag,
  type YearEcho,
} from "../model";

const agoText = (n: number) => (n === 1 ? "一年前的今天" : `${n} 年前的今天`);

export function OnThisDayTease({
  echoes,
  onOpen,
  onDismiss,
}: {
  echoes: YearEcho[];
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const first = echoes[0];
  const total = echoes.reduce((n, e) => n + e.moments.length, 0);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={e => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen())}
      className="text-tau-meta text-ink-2 hover:bg-hover hover:text-ink-1 group/tease flex h-[30px] cursor-pointer items-center gap-2 rounded-[9px] pl-3 pr-1.5"
    >
      <History className="text-accent-text size-[13px] shrink-0" strokeWidth={1.75} />
      <b className="text-accent-text shrink-0 font-medium">{agoText(first.ago)}</b>
      <span className="min-w-0 flex-1 truncate">{firstLine(first.moments[0].content)}</span>
      {total > 1 && <span className="text-tau-sm text-ink-3 shrink-0">还有 {total - 1} 条</span>}
      <IconButton
        title="今天不再提示"
        className="size-[22px] shrink-0 rounded-[6px]"
        onClick={e => {
          e.stopPropagation();
          onDismiss();
        }}
      >
        <X className="size-3" strokeWidth={1.75} />
      </IconButton>
    </div>
  );
}

export function OnThisDayDrawer({
  open,
  today,
  echoes,
  tags,
  onClose,
  onLocate,
}: {
  open: boolean;
  today: string;
  echoes: YearEcho[];
  tags: DiaryTag[];
  onClose: () => void;
  onLocate: (moment: DiaryMoment) => void;
}) {
  useOverlayDismiss(onClose, open);
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  useEdgeFade(scrollEl);
  const d = keyDate(today);

  // 抽屉打开时纸面其余部分让位：点纸面空白处关闭
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("[data-otd-drawer]") || target.closest("[data-otd-keep]")) return;
      if (target.closest("[data-diary-sheet]")) onClose();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, onClose]);

  return (
    <aside
      data-otd-drawer
      aria-label="那年今日"
      aria-hidden={!open}
      inert={!open}
      className={cn(
        "bg-surface shadow-float ease-tau-out absolute bottom-2.5 right-2.5 top-2.5 z-[9] flex w-[min(380px,calc(100%-20px))] flex-col rounded-[14px] outline outline-1 outline-[var(--tau-line-1)] transition-[transform,opacity] duration-[260ms]",
        open ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-3 opacity-0"
      )}
    >
      <div className="flex h-[52px] flex-none items-center gap-2 pl-[18px] pr-2.5">
        <History className="text-accent-text size-[15px]" strokeWidth={1.75} />
        <b className="text-tau-body-lg font-semibold">那年今日</b>
        <span className="text-tau-meta text-ink-3">
          {d.getMonth() + 1}月{d.getDate()}日
        </span>
        <span className="flex-1" />
        <IconButton aria-label="关闭" title="关闭 (Esc)" className="size-7" onClick={onClose}>
          <X className="size-4" strokeWidth={1.75} />
        </IconButton>
      </div>
      <div
        ref={setScrollEl}
        className="edge-fade-scroll min-h-0 flex-1 space-y-[22px] overflow-y-auto px-[18px] pb-[18px]"
      >
        {echoes.map(echo => (
          <section key={echo.year}>
            <div className="mb-1.5 flex items-baseline gap-2">
              <b className="font-tau-mono text-[15px] font-semibold">{echo.year}</b>
              <span className="text-tau-meta text-ink-3">
                {echo.ago === 1 ? "一年前" : `${echo.ago} 年前`} · {weekdayOf(echo.day)}
              </span>
            </div>
            {echo.moments.map(m => (
              <EchoItem key={m.id} moment={m} tags={tags} onClick={() => onLocate(m)} />
            ))}
          </section>
        ))}
      </div>
    </aside>
  );
}

function EchoItem({
  moment,
  tags,
  onClick,
}: {
  moment: DiaryMoment;
  tags: DiaryTag[];
  onClick: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      title="在流里看这一条"
      onClick={onClick}
      onKeyDown={e => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onClick())}
      className="hover:bg-hover -mx-2.5 grid cursor-pointer grid-cols-[42px_minmax(0,1fr)] gap-2 rounded-[10px] py-2 pl-1 pr-2.5"
    >
      <span className="text-tau-meta text-ink-3 font-tau-mono pt-1 tabular-nums">
        {formatTime(moment.createTime)}
      </span>
      <div className="min-w-0">
        <ErrorBoundary>
          <Editor
            kit={getContentKit()}
            key={moment.updateTime}
            readonly
            initValue={moment.content.length ? moment.content : undefined}
            className="text-tau-body leading-[1.75]"
          />
        </ErrorBoundary>
        {moment.tags.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {moment.tags.map(name => (
              <Tag key={name} color={tags.find(t => t.name === name)?.color ?? "gray"}>
                {name}
              </Tag>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
