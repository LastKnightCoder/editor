/**
 * 分组 chips（A2「顶部切换」：分组放进列表板，不与全局侧栏同层）：
 * 全部 + 各分组（色点 + 未解答数），横向滚动、右缘渐隐；右键编辑 / 删除；
 * 问题拖到 chip 上即移动分组；行尾「＋」新建分组。
 */

import { useLayoutEffect, useState, type DragEvent, type ReactNode } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { ContextMenu, IconButton, Menu, cn } from "@tau/ui";
import type { QuestionGroupDTO } from "@/commands/question-group";
import { QUESTION_DRAG_TYPE } from "../model";
import { GroupDot } from "./QuestionBits";

export function GroupChips({
  groups,
  openCounts,
  totalOpen,
  value,
  onChange,
  onCreate,
  onEdit,
  onDelete,
  onDropQuestion,
}: {
  groups: QuestionGroupDTO[];
  openCounts: Map<number, number>;
  totalOpen: number;
  /** null = 全部 */
  value: number | null;
  onChange(groupId: number | null): void;
  onCreate(): void;
  onEdit(group: QuestionGroupDTO): void;
  onDelete(group: QuestionGroupDTO): void;
  onDropQuestion(questionId: number, groupId: number): void;
}) {
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [dropId, setDropId] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = scrollEl;
    if (!el) return;
    const measure = () => setCanScrollRight(el.scrollWidth - el.scrollLeft - el.clientWidth > 8);
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    ro?.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      ro?.disconnect();
    };
  }, [scrollEl, groups]);

  const dropProps = (groupId: number) => ({
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes(QUESTION_DRAG_TYPE)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDropId(groupId);
    },
    onDragLeave: () => setDropId(id => (id === groupId ? null : id)),
    onDrop: (e: DragEvent) => {
      setDropId(null);
      const id = Number(e.dataTransfer.getData(QUESTION_DRAG_TYPE));
      if (id) onDropQuestion(id, groupId);
    },
  });

  const fade = canScrollRight
    ? {
        maskImage: "linear-gradient(90deg, #000 0%, #000 calc(100% - 28px), transparent 100%)",
        WebkitMaskImage:
          "linear-gradient(90deg, #000 0%, #000 calc(100% - 28px), transparent 100%)",
      }
    : undefined;

  return (
    <div className="flex flex-none items-center gap-1.5 pt-2.5">
      <div
        ref={setScrollEl}
        className="flex min-w-0 items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={fade}
      >
        <Chip
          active={value === null}
          onClick={() => onChange(null)}
          label="全部"
          count={totalOpen}
        />
        {groups.map(group => (
          <ContextMenu
            key={group.id}
            content={
              <>
                <Menu.Item
                  icon={<Pencil className="size-[15px]" strokeWidth={1.75} />}
                  onSelect={() => onEdit(group)}
                >
                  编辑分组
                </Menu.Item>
                {!group.isDefault && (
                  <>
                    <Menu.Separator />
                    <Menu.Item
                      danger
                      icon={<Trash2 className="size-[15px]" strokeWidth={1.75} />}
                      onSelect={() => onDelete(group)}
                    >
                      删除分组
                    </Menu.Item>
                  </>
                )}
              </>
            }
          >
            <Chip
              active={value === group.id}
              dropping={dropId === group.id}
              onClick={() => onChange(group.id)}
              label={group.title}
              count={openCounts.get(group.id) ?? 0}
              dot={<GroupDot color={group.color} />}
              {...dropProps(group.id)}
            />
          </ContextMenu>
        ))}
      </div>
      <IconButton
        title="新建分组"
        onClick={onCreate}
        className="border-line-1 text-ink-3 hover:text-ink-1 size-[26px] shrink-0 rounded-full border"
      >
        <Plus className="size-[13px]" strokeWidth={1.75} />
      </IconButton>
    </div>
  );
}

function Chip({
  active,
  dropping = false,
  onClick,
  label,
  count,
  dot,
  ...drop
}: {
  active: boolean;
  dropping?: boolean;
  onClick(): void;
  label: string;
  count: number;
  dot?: ReactNode;
  onDragOver?(e: DragEvent): void;
  onDragLeave?(): void;
  onDrop?(e: DragEvent): void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      {...drop}
      className={cn(
        "ease-tau-out flex h-[26px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-[12px] outline-none transition-[background,color,border-color] duration-150 focus-visible:shadow-[var(--tau-focus-ring)]",
        active
          ? "bg-selected text-accent-text border-transparent font-medium"
          : "border-line-1 text-ink-2 hover:bg-hover hover:text-ink-1 hover:border-transparent",
        dropping && "border-accent"
      )}
    >
      {dot}
      {label}
      {count > 0 && (
        <span className={cn("text-[10.5px] tabular-nums", active ? "opacity-75" : "text-ink-3")}>
          {count}
        </span>
      )}
    </button>
  );
}
