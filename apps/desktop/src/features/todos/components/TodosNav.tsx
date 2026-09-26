/**
 * 侧栏「待办」入口的子项（问题分组同款侧栏嵌套）：各项目（色点 + 未完成数）+ 新建项目 + 已归档。
 * 待办页在栈顶时于入口下方展开，点击经页面参数 id（项目 id）收窄到该项目，再点当前项回到全部。
 * 右键编辑 / 归档 / 删除；「已归档 N」弹菜单点击恢复。页内因此不放项目 pills。
 */

import { useMemo, useState, type ReactNode } from "react";
import { Archive, ArchiveRestore, Pencil, Plus, Trash2 } from "lucide-react";
import { ConfirmDialog, ContextMenu, Menu, cn, toast } from "@tau/ui";
import { GroupDialog } from "@/components/GroupDialog";
import type { TodoGroup } from "@/types";
import { groupDeletionIds, isOpen, liveEntries } from "../model";
import { useNow, useTodoMutations, useTodoSnapshot } from "../queries";
import { GroupDot } from "./TodoBits";

export function TodosNavGroups({
  selectedId,
  onSelect,
}: {
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const { snapshot } = useTodoSnapshot();
  const mutations = useTodoMutations();
  const now = useNow();
  const [dialog, setDialog] = useState<{ group: TodoGroup | null } | null>(null);
  const [deleting, setDeleting] = useState<TodoGroup | null>(null);
  const openCounts = useMemo(() => {
    const counts = new Map<number, number>();
    if (!snapshot) return counts;
    for (const e of liveEntries(snapshot))
      if (e.parentId == null && isOpen(e, now))
        counts.set(e.groupId, (counts.get(e.groupId) ?? 0) + 1);
    return counts;
  }, [snapshot, now]);
  if (!snapshot) return null;
  const current = selectedId ? Number(selectedId) : null;
  const select = (groupId: number) => onSelect(groupId === current ? "" : String(groupId));

  const archive = (group: TodoGroup) =>
    void mutations.setGroupArchived(group.id, true).then(() => {
      if (current === group.id) onSelect("");
      toast.success(`已归档「${group.title}」`, {
        action: {
          label: "撤销",
          onClick: () => void mutations.setGroupArchived(group.id, false),
        },
      });
    });

  return (
    <div className="mb-1 mt-0.5 space-y-px" role="group" aria-label="待办项目">
      {snapshot.groups.map(group => (
        <ContextMenu
          key={group.id}
          content={
            <>
              <Menu.Item
                icon={<Pencil className="size-[15px]" strokeWidth={1.75} />}
                onSelect={() => setDialog({ group })}
              >
                编辑项目
              </Menu.Item>
              <Menu.Separator />
              <Menu.Item
                icon={<Archive className="size-[15px]" strokeWidth={1.75} />}
                onSelect={() => archive(group)}
              >
                归档项目
              </Menu.Item>
              <Menu.Item
                danger
                icon={<Trash2 className="size-[15px]" strokeWidth={1.75} />}
                onSelect={() => setDeleting(group)}
              >
                删除项目
              </Menu.Item>
            </>
          }
        >
          <NavChild
            active={current === group.id}
            label={group.title}
            count={openCounts.get(group.id) ?? 0}
            glyph={<GroupDot color={group.color} className="size-[7px] rounded-[2.5px]" />}
            title={current === group.id ? "再点一次回到全部" : `只看「${group.title}」`}
            onClick={() => select(group.id)}
          />
        </ContextMenu>
      ))}
      <NavChild
        active={false}
        label="新建项目"
        glyph={<Plus className="text-ink-3 size-[13px]" strokeWidth={1.75} />}
        className="text-ink-3"
        onClick={() => setDialog({ group: null })}
      />
      {snapshot.archivedGroups.length > 0 && (
        <Menu
          align="start"
          trigger={
            <NavChild
              active={false}
              label="已归档"
              count={snapshot.archivedGroups.length}
              glyph={<Archive className="text-ink-3 size-[13px]" strokeWidth={1.75} />}
              className="text-ink-3"
            />
          }
        >
          <Menu.Group>已归档项目 · 点击恢复</Menu.Group>
          {snapshot.archivedGroups.map(group => (
            <Menu.Item
              key={group.id}
              icon={<ArchiveRestore className="size-[15px]" strokeWidth={1.75} />}
              onSelect={() =>
                void mutations
                  .setGroupArchived(group.id, false)
                  .then(() => toast.success(`已恢复「${group.title}」`))
              }
            >
              <span className="flex items-center gap-2">
                <GroupDot color={group.color} className="size-[7px]" />
                {group.title}
              </span>
            </Menu.Item>
          ))}
        </Menu>
      )}

      <GroupDialog
        open={dialog !== null}
        group={dialog?.group ?? null}
        onClose={() => setDialog(null)}
        onSubmit={async (title, color) => {
          if (dialog?.group) {
            await mutations.updateGroup(dialog.group.id, title, color);
            toast.success("项目已更新");
          } else {
            const created = await mutations.createGroup(title, color);
            onSelect(String(created.id));
            toast.success(`已创建项目「${title}」`);
          }
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={open => {
          if (!open) setDeleting(null);
        }}
        title="删除项目"
        context={deleting?.title}
        danger
        description="项目下的任务、子任务、打卡记录与关联笔记链接会一起删除。"
        impact={(() => {
          const n = deleting ? groupDeletionIds(snapshot, deleting.id).size : 0;
          return n > 0 ? `${n} 个任务将一起删除` : undefined;
        })()}
        confirmText="删除"
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await mutations.deleteGroup(deleting.id);
            if (current === deleting.id) onSelect("");
            toast.success(`已删除「${deleting.title}」`);
          } catch (error) {
            toast.error(`删除失败：${String(error)}`);
            throw error;
          }
        }}
      />
    </div>
  );
}

function NavChild({
  active,
  label,
  count = 0,
  glyph,
  title,
  className,
  onClick,
  ...rest
}: {
  active: boolean;
  label: string;
  count?: number;
  glyph: ReactNode;
  title?: string;
  className?: string;
  onClick?: () => void;
}) {
  return (
    // 让出父项图标列（按 body 字号折算）放在按钮外：高亮只盖色点起的一段，色点落在父项文字列
    <div className="flex gap-2.5">
      <span aria-hidden className="text-tau-body w-[1.06em] shrink-0" />
      <button
        type="button"
        onClick={onClick}
        {...rest}
        aria-current={active ? "page" : undefined}
        title={title}
        className={cn(
          "text-tau-meta ease-tau-out flex h-[calc(1.5em+10px)] min-w-0 flex-1 items-center gap-2.5 rounded-[9px] px-2.5 text-left transition-[background,color] duration-[160ms]",
          active
            ? "bg-selected text-ink-1 font-medium"
            : "text-ink-2 hover:bg-hover hover:text-ink-1",
          className
        )}
      >
        <span className="grid w-[13px] shrink-0 place-items-center">{glyph}</span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {count > 0 && (
          <span className="text-tau-tiny text-ink-3 font-normal tabular-nums">{count}</span>
        )}
      </button>
    </div>
  );
}
