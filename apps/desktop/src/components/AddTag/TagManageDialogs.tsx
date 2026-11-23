/**
 * 侧栏标签 ⋯ 菜单的两个确认框：重命名（改成已有名字即合并）与删除（只从条目上摘掉）。
 * 卡片与文章共用；hierarchical 时子标签随父级一起改名 / 删除。
 */

import { useEffect, useState } from "react";
import { Button, ConfirmDialog, Dialog, DialogBody, Input, toast } from "@tau/ui";

export interface TagManageTarget {
  tag: string;
  count: number;
}

interface CommonProps {
  /** 条目的叫法与量词，如 { noun: "卡片", measure: "张" } */
  unit: { noun: string; measure: string };
  hierarchical: boolean;
}

const amount = (count: number, { noun, measure }: CommonProps["unit"]) =>
  `${count} ${measure}${noun}`;

export function RenameTagDialog({
  target,
  existing,
  unit,
  hierarchical,
  onOpenChange,
  onRename,
}: CommonProps & {
  target: TagManageTarget | null;
  /** 现有标签（含计数），用来判断是否合并 */
  existing: TagManageTarget[];
  onOpenChange: (open: boolean) => void;
  onRename: (from: string, to: string) => Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (target) setValue(target.tag);
  }, [target]);

  const next = value.trim();
  const unchanged = !target || !next || next === target.tag;
  const merged = !unchanged ? existing.find(item => item.tag === next) : undefined;
  const invalid = hierarchical && (next.startsWith("/") || next.endsWith("/"));

  const submit = async () => {
    if (!target || unchanged || invalid) return;
    setSaving(true);
    try {
      await onRename(target.tag, next);
      onOpenChange(false);
    } catch {
      toast.error("标签改名失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={target != null}
      onOpenChange={onOpenChange}
      title="重命名标签"
      subtitle={target ? `「${target.tag}」用在 ${amount(target.count, unit)}上` : undefined}
      locked={saving}
      size="md"
      impact={
        merged
          ? `「${next}」已经存在（${amount(merged.count, unit)}），确定后两个标签合并为「${next}」`
          : undefined
      }
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button
            variant="primary"
            loading={saving}
            disabled={unchanged || invalid}
            onClick={() => void submit()}
          >
            {merged ? "合并" : "重命名"}
          </Button>
        </>
      }
    >
      <DialogBody>
        <Input
          data-autofocus
          value={value}
          aria-label="新的标签名"
          onChange={event => setValue(event.target.value)}
          onKeyDown={event => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void submit();
            }
          }}
        />
        {hierarchical && (
          <p className="text-tau-sm text-ink-3 mt-2.5">
            子标签一起改名：「{target?.tag}/…」会变成「{next || target?.tag}/…」
          </p>
        )}
      </DialogBody>
    </Dialog>
  );
}

export function DeleteTagDialog({
  target,
  unit,
  hierarchical,
  onOpenChange,
  onDelete,
}: CommonProps & {
  target: TagManageTarget | null;
  onOpenChange: (open: boolean) => void;
  onDelete: (tag: string) => Promise<void>;
}) {
  return (
    <ConfirmDialog
      open={target != null}
      onOpenChange={onOpenChange}
      title="删除标签"
      context={target?.tag}
      description={`标签会从所有${unit.noun}上移除${hierarchical ? "（子标签一起移除）" : ""}，${unit.noun}本身不受影响。`}
      impact={target ? `${amount(target.count, unit)}会失去这个标签` : undefined}
      confirmText="删除"
      danger
      onConfirm={async () => {
        if (!target) return;
        try {
          await onDelete(target.tag);
        } catch {
          toast.error("删除标签失败");
          throw new Error("删除标签失败");
        }
      }}
    />
  );
}
