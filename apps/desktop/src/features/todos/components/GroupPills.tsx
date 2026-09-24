/**
 * 项目 pills（与文章标签 / 项目类型 pills 同构）：全部 + 各项目（色点 + 未完成数），
 * 右键菜单编辑与归档；行尾「＋」新建项目、「已归档 N」菜单恢复。
 * 项目多时 pills 横向滚动（右缘还有内容时渐隐，同文章标签 pills），「＋」与「已归档」在滚动区外不压缩。
 */

import { useLayoutEffect, useState, type ReactNode } from "react";
import { Archive, ArchiveRestore, Pencil, Plus } from "lucide-react";
import { Button, ContextMenu, IconButton, Menu, cn } from "@tau/ui";
import type { TodoGroup } from "@/types";
import { GroupDot } from "./TodoBits";

export function GroupPills({
  groups,
  archivedGroups,
  openCounts,
  totalOpen,
  value,
  onChange,
  onCreate,
  onEdit,
  onArchive,
  onRestore,
}: {
  groups: TodoGroup[];
  archivedGroups: TodoGroup[];
  openCounts: Map<number, number>;
  totalOpen: number;
  /** 0 = 全部 */
  value: number;
  onChange(groupId: number): void;
  onCreate(): void;
  onEdit(group: TodoGroup): void;
  onArchive(group: TodoGroup): void;
  onRestore(group: TodoGroup): void;
}) {
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  /* 是否溢出 + 右缘渐隐条件：还有未滚到的内容（初始测一次 + 滚动/尺寸变化重测） */
  useLayoutEffect(() => {
    const el = scrollEl;
    if (!el) return;
    const measure = () => {
      setOverflowing(el.scrollWidth > el.clientWidth);
      setCanScrollRight(el.scrollWidth - el.scrollLeft - el.clientWidth > 8);
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    ro?.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      ro?.disconnect();
    };
  }, [scrollEl, groups]);

  const fadeMask = canScrollRight
    ? {
        maskImage: "linear-gradient(90deg, #000 0%, #000 calc(100% - 28px), transparent 100%)",
        WebkitMaskImage:
          "linear-gradient(90deg, #000 0%, #000 calc(100% - 28px), transparent 100%)",
      }
    : undefined;

  return (
    <div className="flex h-9 flex-none items-center gap-1.5 pb-1">
      {/* py-1：给 pill 的 shadow-card 留出不被横向滚动裁掉的空间；
          溢出时出现的横向滚动条（全局 6px，占位）压在底部：顶部补等高留白，pills 仍与「＋」对齐居中
          （多出的高度上溢进快速添加栏的 mb-3、下溢进看板的 pt-1，行高不变） */}
      <div
        ref={setScrollEl}
        className={cn(
          "flex min-w-0 items-center gap-1.5 overflow-x-auto pb-1",
          overflowing ? "pt-2.5" : "pt-1"
        )}
        style={fadeMask}
      >
        <Pill active={value === 0} onClick={() => onChange(0)} label="全部" count={totalOpen} />
        {groups.map(group => (
          <ContextMenu
            key={group.id}
            content={
              <>
                <Menu.Item
                  icon={<Pencil className="size-[15px]" strokeWidth={1.75} />}
                  onSelect={() => onEdit(group)}
                >
                  编辑项目
                </Menu.Item>
                <Menu.Separator />
                <Menu.Item
                  icon={<Archive className="size-[15px]" strokeWidth={1.75} />}
                  onSelect={() => onArchive(group)}
                >
                  归档项目
                </Menu.Item>
              </>
            }
          >
            <Pill
              active={value === group.id}
              onClick={() => onChange(group.id)}
              label={group.title}
              count={openCounts.get(group.id) ?? 0}
              dot={<GroupDot color={group.color} className="size-[7px] rounded-[2.5px]" />}
            />
          </ContextMenu>
        ))}
      </div>
      <IconButton
        title="新建项目"
        onClick={onCreate}
        className="bg-surface shadow-card text-ink-2 hover:text-ink-1 size-6 shrink-0 rounded-full"
      >
        <Plus className="size-[13px]" strokeWidth={1.75} />
      </IconButton>
      <span className="flex-1" />
      {archivedGroups.length > 0 && (
        <Menu
          align="end"
          trigger={
            <Button variant="ghost" size="sm" icon={Archive} className="shrink-0">
              已归档 {archivedGroups.length}
            </Button>
          }
        >
          <Menu.Group>已归档项目 · 点击恢复</Menu.Group>
          {archivedGroups.map(group => (
            <Menu.Item
              key={group.id}
              icon={<ArchiveRestore className="size-[15px]" strokeWidth={1.75} />}
              onSelect={() => onRestore(group)}
            >
              <span className="flex items-center gap-2">
                <GroupDot color={group.color} className="size-[7px]" />
                {group.title}
              </span>
            </Menu.Item>
          ))}
        </Menu>
      )}
    </div>
  );
}

function Pill({
  active,
  onClick,
  label,
  count,
  dot,
}: {
  active: boolean;
  onClick(): void;
  label: string;
  count: number;
  dot?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "ease-tau-out flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[12px] outline-none transition-[background,color] duration-150 focus-visible:shadow-[var(--tau-focus-ring)]",
        active
          ? "bg-selected text-accent-text font-medium"
          : "bg-surface shadow-card text-ink-2 hover:text-ink-1"
      )}
    >
      {dot}
      {label}
      <span className={cn("text-[10.5px] tabular-nums", active ? "opacity-75" : "text-ink-3")}>
        {count}
      </span>
    </button>
  );
}
