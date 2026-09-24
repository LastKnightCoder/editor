/**
 * 抽屉详情（B3：从右侧滑入，恰好盖住右板；不压暗议程，Esc 经页面浮层仲裁逐层关闭）。
 * 内容：标题（即改即存）→ 项目 / 父任务路径 → 属性 → 打卡 → 子任务 → 关联笔记 → 描述 → 时间脚注。
 */

import { useEffect, useState } from "react";
import { ChevronRight, Trash2, X } from "lucide-react";
import { IconButton, cn, useEdgeFade } from "@tau/ui";
import { useOverlayDismiss } from "@/page/PageProvider";
import type { TodoGroup } from "@/types";
import { dayWord, doneToday, hm, isOverdue, monthDay } from "../model";
import type { TodoMutations } from "../queries";
import type { TodoEntry, TodoSnapshot } from "../types";
import { DetailFields } from "./DetailFields";
import {
  DescriptionSection,
  HabitSection,
  NoteLinksSection,
  SubtaskSection,
} from "./DetailSections";
import { GroupDot, TodoCheck } from "./TodoBits";

export function TodoDrawer({
  entry,
  snapshot,
  groups,
  now,
  mutations,
  onClose,
  onOpen,
  onToggle,
  onDelete,
}: {
  entry: TodoEntry | null;
  snapshot: TodoSnapshot;
  groups: TodoGroup[];
  now: number;
  mutations: TodoMutations;
  onClose(): void;
  onOpen(entry: TodoEntry): void;
  onToggle(entry: TodoEntry): void;
  onDelete(entry: TodoEntry): void;
}) {
  const open = entry !== null;
  useOverlayDismiss(onClose, open);

  /* 关闭时保留最后一条内容做退场动画 */
  const [shown, setShown] = useState<TodoEntry | null>(entry);
  useEffect(() => {
    if (entry) setShown(entry);
  }, [entry]);
  const current = entry ?? shown;

  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  useEdgeFade(scrollEl);

  return (
    <aside
      aria-label="任务详情"
      aria-hidden={!open}
      inert={!open}
      className={cn(
        "bg-surface shadow-float ease-tau-out absolute inset-y-0 right-0 z-10 flex w-[440px] origin-right flex-col rounded-[16px] outline outline-1 outline-[var(--tau-line-1)] transition-[transform,opacity] duration-[240ms]",
        // 贴 right-0 无右移余量：以右缘为原点微缩退场，外框始终在容器内，不越界撑出滚动条
        open ? "scale-100 opacity-100" : "pointer-events-none scale-[0.98] opacity-0"
      )}
    >
      {current && (
        <DrawerBody
          key={current.id}
          entry={current}
          snapshot={snapshot}
          groups={groups}
          now={now}
          mutations={mutations}
          onClose={onClose}
          onOpen={onOpen}
          onToggle={onToggle}
          onDelete={onDelete}
          setScrollEl={setScrollEl}
        />
      )}
    </aside>
  );
}

function DrawerBody({
  entry,
  snapshot,
  groups,
  now,
  mutations,
  onClose,
  onOpen,
  onToggle,
  onDelete,
  setScrollEl,
}: {
  entry: TodoEntry;
  snapshot: TodoSnapshot;
  groups: TodoGroup[];
  now: number;
  mutations: TodoMutations;
  onClose(): void;
  onOpen(entry: TodoEntry): void;
  onToggle(entry: TodoEntry): void;
  onDelete(entry: TodoEntry): void;
  setScrollEl(el: HTMLDivElement | null): void;
}) {
  const [title, setTitle] = useState(entry.title);
  useEffect(() => setTitle(entry.title), [entry.title]);
  const group = groups.find(g => g.id === entry.groupId);
  const parent = entry.parentId != null ? snapshot.byId.get(entry.parentId) : undefined;
  const recurring = entry.type === "recurring";
  const checked = recurring ? doneToday(entry, now) : entry.isCompleted;

  const commitTitle = () => {
    const next = title.trim();
    if (!next) setTitle(entry.title);
    else if (next !== entry.title) void mutations.updateItem(entry, { title: next });
  };

  return (
    <>
      <div className="flex flex-none items-start gap-2.5 pb-1 pl-[18px] pr-3.5 pt-4">
        <TodoCheck
          size="lg"
          className="mt-1"
          checked={checked}
          recurring={recurring}
          overdue={isOverdue(entry, now)}
          label={recurring ? "今日打卡" : checked ? "标记未完成" : "完成"}
          onToggle={() => onToggle(entry)}
        />
        <textarea
          aria-label="任务标题"
          rows={1}
          value={title}
          onChange={e => setTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={e => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          className="hover:bg-hover focus:bg-page field-sizing-content -mx-1 min-w-0 flex-1 resize-none rounded-[7px] bg-transparent px-1 text-[16px] font-semibold leading-[1.5] tracking-[-0.005em] outline-none"
        />
        <IconButton title="删除（可撤销）" onClick={() => onDelete(entry)}>
          <Trash2 className="size-[15px]" strokeWidth={1.75} />
        </IconButton>
        <IconButton title="关闭 (Esc)" onClick={onClose}>
          <X className="size-[15px]" strokeWidth={1.75} />
        </IconButton>
      </div>

      <div className="text-ink-3 flex flex-none items-center gap-1.5 pb-1.5 pl-[46px] pr-[18px] text-[11.5px]">
        <GroupDot color={group?.color} className="size-[7px]" />
        <span className="text-ink-2">{group?.title ?? "未归类"}</span>
        {parent && (
          <>
            <ChevronRight className="size-3" strokeWidth={1.75} />
            <button
              type="button"
              onClick={() => onOpen(parent)}
              className="text-ink-2 hover:text-accent-text truncate"
            >
              {parent.title}
            </button>
          </>
        )}
      </div>

      <div
        ref={setScrollEl}
        className="edge-fade-scroll min-h-0 flex-1 overflow-y-auto px-[18px] pb-5 pt-2"
      >
        <DetailFields entry={entry} groups={groups} mutations={mutations} />
        <HabitSection entry={entry} now={now} mutations={mutations} />
        <SubtaskSection entry={entry} snapshot={snapshot} mutations={mutations} onOpen={onOpen} />
        <NoteLinksSection entry={entry} mutations={mutations} />
        <DescriptionSection entry={entry} mutations={mutations} />
        <p className="text-ink-3 mt-5 text-[11.5px] tabular-nums">
          创建于 {monthDay(entry.createTime)} {hm(entry.createTime)}
          {entry.isCompleted &&
            entry.completedAt != null &&
            ` · 完成于 ${dayWord(entry.completedAt, now)} ${hm(entry.completedAt)}`}
        </p>
      </div>
    </>
  );
}
