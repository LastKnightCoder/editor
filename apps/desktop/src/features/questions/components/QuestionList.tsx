/**
 * 问题列表：按「探究中 / 待探究 / 已解答」三段，段头可折叠（已解答默认折叠）。
 * 行 = 状态环（点击弹状态菜单）+ 问题 + 元信息（分组 · 材料构成 · 时间）；右键 / 更多为问题菜单；
 * 行可拖到分组 chip 上移动分组。
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, MoreHorizontal } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ContextMenu, IconButton, Menu, cn, useEdgeFade } from "@tau/ui";
import type { QuestionGroupDTO } from "@/commands/question-group";
import type { QuestionStatus, QuestionSummary } from "@/types";
import { QUESTION_DRAG_TYPE, STATUS_META, relativeDay, type QuestionSection } from "../model";
import { Composition, GroupDot, StatusRing } from "./QuestionBits";

export function QuestionList({
  sections,
  groups,
  showGroup,
  selectedId,
  collapsed,
  now,
  onToggleSection,
  onSelect,
  renderStatusMenu,
  renderMenu,
  empty,
}: {
  sections: QuestionSection[];
  groups: Map<number, QuestionGroupDTO>;
  showGroup: boolean;
  selectedId: number | null;
  collapsed: ReadonlySet<QuestionStatus>;
  now: number;
  onToggleSection(status: QuestionStatus): void;
  onSelect(question: QuestionSummary): void;
  renderStatusMenu(question: QuestionSummary): ReactNode;
  renderMenu(question: QuestionSummary): ReactNode;
  empty: ReactNode;
}) {
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  useEdgeFade(scrollEl);

  const rows = useMemo(
    () =>
      sections.flatMap(section => {
        const header = { type: "header" as const, section };
        return collapsed.has(section.status)
          ? [header]
          : [header, ...section.items.map(question => ({ type: "question" as const, question }))];
      }),
    [sections, collapsed]
  );
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollEl,
    estimateSize: index => (rows[index]?.type === "header" ? 40 : 68),
    overscan: 8,
  });

  /* 键盘切换选中后滚入视野 */
  useEffect(() => {
    if (selectedId == null) return;
    const index = rows.findIndex(row => row.type === "question" && row.question.id === selectedId);
    if (index >= 0) virtualizer.scrollToIndex(index, { align: "auto" });
  }, [selectedId, rows, virtualizer]);

  return (
    <div
      ref={setScrollEl}
      className="edge-fade-scroll -mr-1.5 mt-2 min-h-0 flex-1 overflow-y-auto pb-2 pr-1.5"
    >
      {sections.length === 0 ? (
        empty
      ) : (
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map(item => {
            const row = rows[item.index];
            if (!row) return null;
            if (row.type === "header") {
              const section = row.section;
              const folded = collapsed.has(section.status);
              return (
                <button
                  key={item.key}
                  ref={virtualizer.measureElement}
                  data-index={item.index}
                  type="button"
                  onClick={() => onToggleSection(section.status)}
                  aria-expanded={!folded}
                  className="text-ink-2 absolute left-0 top-0 flex w-full items-center gap-2 px-2 pb-1.5 pt-3.5 text-left text-[12.5px] font-semibold"
                  style={{ transform: `translateY(${item.start}px)` }}
                >
                  <ChevronDown
                    className={cn(
                      "text-ink-3 ease-tau-out size-[13px] transition-transform duration-200",
                      folded && "-rotate-90"
                    )}
                    strokeWidth={1.75}
                  />
                  {STATUS_META[section.status].label}
                  <span className="text-ink-3 font-normal tabular-nums">
                    {section.items.length}
                  </span>
                  <span className="text-ink-3 ml-1 text-[12px] font-normal">
                    {STATUS_META[section.status].hint}
                  </span>
                </button>
              );
            }
            const question = row.question;
            return (
              <div
                key={item.key}
                ref={virtualizer.measureElement}
                data-index={item.index}
                className="absolute left-0 top-0 w-full pb-1"
                style={{ transform: `translateY(${item.start}px)` }}
              >
                <QuestionRow
                  question={question}
                  group={groups.get(question.groupId)}
                  showGroup={showGroup}
                  selected={question.id === selectedId}
                  now={now}
                  onSelect={() => onSelect(question)}
                  statusMenu={renderStatusMenu(question)}
                  menu={renderMenu(question)}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function QuestionRow({
  question,
  group,
  showGroup,
  selected,
  now,
  onSelect,
  statusMenu,
  menu,
}: {
  question: QuestionSummary;
  group: QuestionGroupDTO | undefined;
  showGroup: boolean;
  selected: boolean;
  now: number;
  onSelect(): void;
  statusMenu: ReactNode;
  menu: ReactNode;
}) {
  const time =
    question.status === "resolved"
      ? `${relativeDay(question.resolvedTime ?? question.updateTime, now)}解答`
      : relativeDay(question.lastActivityTime, now);
  return (
    <ContextMenu content={menu}>
      <div
        data-question={question.id}
        role="option"
        aria-selected={selected}
        tabIndex={-1}
        draggable
        onDragStart={e => {
          e.dataTransfer.setData(QUESTION_DRAG_TYPE, String(question.id));
          e.dataTransfer.effectAllowed = "move";
        }}
        onClick={onSelect}
        className={cn(
          "group/row flex cursor-default items-start gap-[11px] rounded-[11px] px-2.5 py-[9px] outline-none",
          selected ? "bg-selected" : "hover:bg-hover"
        )}
      >
        <Menu
          trigger={
            <button
              type="button"
              title="设置状态"
              onClick={e => e.stopPropagation()}
              className="mt-[3px] rounded-full outline-none hover:shadow-[0_0_0_3px_var(--tau-bg-hover)] focus-visible:shadow-[var(--tau-focus-ring)]"
            >
              <StatusRing status={question.status} />
            </button>
          }
        >
          {statusMenu}
        </Menu>
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              "text-[13.5px] leading-[1.55]",
              question.status === "resolved" ? "text-ink-2" : "text-ink-1"
            )}
          >
            {question.questionContent}
          </div>
          <div className="text-ink-3 mt-[3px] flex items-center gap-2.5 text-[11.5px]">
            {showGroup && group && (
              <span className="inline-flex items-center gap-[5px]">
                <GroupDot color={group.color} />
                {group.title}
              </span>
            )}
            <Composition counts={question.linkCounts} />
            <span>{time}</span>
          </div>
        </div>
        <Menu
          align="end"
          trigger={
            <IconButton
              title="更多"
              onClick={e => e.stopPropagation()}
              className={cn(
                "size-[22px] shrink-0 rounded-[6px] opacity-0 focus-visible:opacity-100 group-hover/row:opacity-100",
                selected && "opacity-100"
              )}
            >
              <MoreHorizontal className="size-[13px]" strokeWidth={1.75} />
            </IconButton>
          }
        >
          {menu}
        </Menu>
      </div>
    </ContextMenu>
  );
}
