/**
 * 侧栏标签 ⋯ 菜单的两个确认框：重命名（改成已有名字即合并）与删除（只从条目上摘掉）。
 * 卡片与文章共用；hierarchical 时子标签随父级一起改名 / 删除。
 */

import { useTagsI18n } from "./i18n";
import { useEffect, useState } from "react";
import { Button, ConfirmDialog, Dialog, DialogBody, Input, toast } from "@tau/ui";

export interface TagManageTarget {
  tag: string;
  count: number;
}

interface CommonProps {
  entity: "card" | "article" | "todo";
  hierarchical: boolean;
}

export function RenameTagDialog({
  target,
  existing,
  entity,
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
  const { t, locale } = useTagsI18n();
  const amount = (count: number) =>
    t(`amount.${entity}`, { count, amount: count.toLocaleString(locale) });
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
      toast.error(t("rename.failed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={target != null}
      onOpenChange={onOpenChange}
      title={t("rename.title")}
      subtitle={
        target ? t("rename.subtitle", { tag: target.tag, amount: amount(target.count) }) : undefined
      }
      locked={saving}
      size="md"
      impact={merged ? t("rename.merge", { tag: next, amount: amount(merged.count) }) : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("cancel")}
          </Button>
          <Button
            variant="primary"
            loading={saving}
            disabled={unchanged || invalid}
            onClick={() => void submit()}
          >
            {t(merged ? "merge" : "rename")}
          </Button>
        </>
      }
    >
      <DialogBody>
        <Input
          data-autofocus
          value={value}
          aria-label={t("rename.input")}
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
            {t("rename.children", { from: target?.tag ?? "", to: next || target?.tag || "" })}
          </p>
        )}
      </DialogBody>
    </Dialog>
  );
}

export function DeleteTagDialog({
  target,
  entity,
  hierarchical,
  onOpenChange,
  onDelete,
}: CommonProps & {
  target: TagManageTarget | null;
  onOpenChange: (open: boolean) => void;
  onDelete: (tag: string) => Promise<void>;
}) {
  const { t, locale } = useTagsI18n();
  return (
    <ConfirmDialog
      open={target != null}
      onOpenChange={onOpenChange}
      title={t("delete.title")}
      context={target?.tag}
      description={t(`delete.${entity}${hierarchical ? "Tree" : ""}`)}
      impact={
        target
          ? t("delete.impact", {
              amount: t(`amount.${entity}`, {
                count: target.count,
                amount: target.count.toLocaleString(locale),
              }),
            })
          : undefined
      }
      confirmText={t("delete.confirm")}
      danger
      onConfirm={async () => {
        if (!target) return;
        try {
          await onDelete(target.tag);
        } catch {
          toast.error(t("delete.failed"));
          throw new Error("删除标签失败");
        }
      }}
    />
  );
}
