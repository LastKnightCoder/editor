/**
 * 侧栏「问题管理」入口的子项（日记 / 白板同款侧栏嵌套）：各分组（色点 + 未解答数）+ 新建分组。
 * 问题页在栈顶时于入口下方展开，点击经页面参数 id（分组 id）收窄到该分组，再点当前项回到全部。
 * 右键编辑 / 删除；问题行拖到分组上即移动分组。页内因此不放分组栏。
 */

import { useMemo, useState, type DragEvent, type ReactNode } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { ContextMenu, Menu, cn, toast } from "@tau/ui";
import { GroupDialog } from "@/components/GroupDialog";
import type { QuestionGroupDTO } from "@/commands/question-group";
import { QUESTION_DRAG_TYPE } from "../model";
import { moveQuestion, questionMutations, useQuestionsSnapshot } from "../queries";
import { GroupDot } from "./QuestionBits";

export function QuestionsNavGroups({
  selectedId,
  onSelect,
}: {
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const { snapshot } = useQuestionsSnapshot();
  const [dialog, setDialog] = useState<{ group: QuestionGroupDTO | null } | null>(null);
  const [dropId, setDropId] = useState<number | null>(null);
  const openCounts = useMemo(() => {
    const counts = new Map<number, number>();
    snapshot?.questions.forEach(q => {
      if (q.status !== "resolved") counts.set(q.groupId, (counts.get(q.groupId) ?? 0) + 1);
    });
    return counts;
  }, [snapshot]);
  if (!snapshot) return null;
  const current = selectedId ? Number(selectedId) : null;
  const select = (groupId: number) => onSelect(groupId === current ? "" : String(groupId));

  const dropProps = (group: QuestionGroupDTO) => ({
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes(QUESTION_DRAG_TYPE)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDropId(group.id);
    },
    onDragLeave: () => setDropId(id => (id === group.id ? null : id)),
    onDrop: (e: DragEvent) => {
      setDropId(null);
      const question = snapshot.questions.find(
        q => q.id === Number(e.dataTransfer.getData(QUESTION_DRAG_TYPE))
      );
      if (question && question.groupId !== group.id) moveQuestion(question, group.id, group.title);
    },
  });

  return (
    <div className="mb-1 mt-0.5 space-y-px" role="group" aria-label="问题分组">
      {snapshot.groups.map(group => (
        <ContextMenu
          key={group.id}
          content={
            <>
              <Menu.Item
                icon={<Pencil className="size-[15px]" strokeWidth={1.75} />}
                onSelect={() => setDialog({ group })}
              >
                编辑分组
              </Menu.Item>
              {!group.isDefault && (
                <>
                  <Menu.Separator />
                  <Menu.Item
                    danger
                    icon={<Trash2 className="size-[15px]" strokeWidth={1.75} />}
                    onSelect={() =>
                      void questionMutations
                        .deleteGroup(group.id)
                        .then(() => {
                          if (current === group.id) onSelect("");
                          toast.success(`已删除分组「${group.title}」，其中的问题移到默认分组`);
                        })
                        .catch(() => toast.error("删除分组失败"))
                    }
                  >
                    删除分组
                  </Menu.Item>
                </>
              )}
            </>
          }
        >
          <NavChild
            active={current === group.id}
            dropping={dropId === group.id}
            label={group.title}
            count={openCounts.get(group.id) ?? 0}
            glyph={<GroupDot color={group.color} />}
            title={current === group.id ? "再点一次回到全部" : `只看「${group.title}」`}
            onClick={() => select(group.id)}
            {...dropProps(group)}
          />
        </ContextMenu>
      ))}
      <NavChild
        active={false}
        label="新建分组"
        glyph={<Plus className="text-ink-3 size-[13px]" strokeWidth={1.75} />}
        className="text-ink-3"
        onClick={() => setDialog({ group: null })}
      />
      <GroupDialog
        open={dialog !== null}
        group={dialog?.group ?? null}
        noun="分组"
        placeholder="例如：编辑器原理"
        onClose={() => setDialog(null)}
        onSubmit={async (title, color) => {
          if (dialog?.group) {
            await questionMutations.updateGroup(dialog.group.id, title, color);
            toast.success("分组已更新");
          } else {
            const created = await questionMutations.createGroup(title, color);
            if (created) onSelect(String(created.id));
            toast.success(`已创建分组「${title}」`);
          }
        }}
      />
    </div>
  );
}

function NavChild({
  active,
  dropping = false,
  label,
  count = 0,
  glyph,
  title,
  className,
  onClick,
  ...drop
}: {
  active: boolean;
  dropping?: boolean;
  label: string;
  count?: number;
  glyph: ReactNode;
  title?: string;
  className?: string;
  onClick: () => void;
  onDragOver?(e: DragEvent): void;
  onDragLeave?(): void;
  onDrop?(e: DragEvent): void;
}) {
  return (
    // 让出父项图标列（按 body 字号折算）放在按钮外：高亮只盖色点起的一段，色点落在父项文字列
    <div className="flex gap-2.5">
      <span aria-hidden className="text-tau-body w-[1.06em] shrink-0" />
      <button
        type="button"
        onClick={onClick}
        {...drop}
        aria-current={active ? "page" : undefined}
        title={title}
        className={cn(
          "text-tau-meta ease-tau-out flex h-[calc(1.5em+10px)] min-w-0 flex-1 items-center gap-2.5 rounded-[9px] px-2.5 text-left transition-[background,color,box-shadow] duration-[160ms]",
          active
            ? "bg-selected text-ink-1 font-medium"
            : "text-ink-2 hover:bg-hover hover:text-ink-1",
          dropping && "shadow-[inset_0_0_0_1px_var(--tau-accent)]",
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
