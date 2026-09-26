/**
 * 抽屉详情（B3：非模态 Drawer，恰好盖住右板；不压暗议程，Esc 经页面浮层仲裁逐层关闭）。
 * 内容：标题（即改即存）→ 项目 / 父任务路径 → 属性 → 打卡 → 子任务 → 关联笔记 → 描述 → 时间脚注。
 */

import { Fragment, useEffect, useState } from "react";
import { ChevronRight, Trash2 } from "lucide-react";
import { Drawer, IconButton, useRetainedValue } from "@tau/ui";
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
  const current = useRetainedValue(entry);

  const group = current ? groups.find(g => g.id === current.groupId) : undefined;
  const parent = current?.parentId != null ? snapshot.byId.get(current.parentId) : undefined;
  const recurring = current?.type === "recurring";
  const checked = current ? (recurring ? doneToday(current, now) : current.isCompleted) : false;

  return (
    <Drawer
      modal={false}
      open={open}
      onOpenChange={next => !next && onClose()}
      size="sm"
      label="任务详情"
      className="top-0"
      icon={
        current && (
          <TodoCheck
            size="lg"
            className="mt-1"
            checked={checked}
            recurring={recurring}
            overdue={isOverdue(current, now)}
            label={recurring ? "今日打卡" : checked ? "标记未完成" : "完成"}
            onToggle={() => onToggle(current)}
          />
        )
      }
      title={current && <TitleField key={current.id} entry={current} mutations={mutations} />}
      subtitle={
        <span className="flex items-center gap-1.5 text-[11.5px]">
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
        </span>
      }
      actions={
        current && (
          <IconButton title="删除（可撤销）" onClick={() => onDelete(current)}>
            <Trash2 className="size-[15px]" strokeWidth={1.75} />
          </IconButton>
        )
      }
    >
      {current && (
        // 按任务 id 重挂：描述编辑器等非受控区块切换任务时必须重置
        <Fragment key={current.id}>
          <DetailFields entry={current} groups={groups} mutations={mutations} />
          <HabitSection entry={current} now={now} mutations={mutations} />
          <SubtaskSection
            entry={current}
            snapshot={snapshot}
            mutations={mutations}
            onOpen={onOpen}
          />
          <NoteLinksSection entry={current} mutations={mutations} />
          <DescriptionSection entry={current} mutations={mutations} />
          <p className="text-ink-3 mt-5 text-[11.5px] tabular-nums">
            创建于 {monthDay(current.createTime)} {hm(current.createTime)}
            {current.isCompleted &&
              current.completedAt != null &&
              ` · 完成于 ${dayWord(current.completedAt, now)} ${hm(current.completedAt)}`}
          </p>
        </Fragment>
      )}
    </Drawer>
  );
}

/** 标题即改即存：失焦或回车提交，清空则回退原值；按任务 id 挂 key，切换任务时重置草稿 */
function TitleField({ entry, mutations }: { entry: TodoEntry; mutations: TodoMutations }) {
  const [title, setTitle] = useState(entry.title);
  useEffect(() => setTitle(entry.title), [entry.title]);

  const commitTitle = () => {
    const next = title.trim();
    if (!next) setTitle(entry.title);
    else if (next !== entry.title) void mutations.updateItem(entry, { title: next });
  };

  return (
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
  );
}
