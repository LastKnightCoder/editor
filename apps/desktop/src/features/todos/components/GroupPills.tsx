/**
 * 项目 pills（与文章标签 / 项目类型 pills 同构）：全部 + 各项目（色点 + 未完成数），
 * 右键菜单编辑与归档；行尾「＋」新建项目、「已归档 N」菜单恢复。
 */

import type { ReactNode } from "react";
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
  return (
    <div className="flex h-9 flex-none items-center gap-1.5 pb-1">
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
      <IconButton
        title="新建项目"
        onClick={onCreate}
        className="bg-surface shadow-card text-ink-2 hover:text-ink-1 size-6 rounded-full"
      >
        <Plus className="size-[13px]" strokeWidth={1.75} />
      </IconButton>
      <span className="flex-1" />
      {archivedGroups.length > 0 && (
        <Menu
          align="end"
          trigger={
            <Button variant="ghost" size="sm" icon={Archive}>
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
