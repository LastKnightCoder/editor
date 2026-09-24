/**
 * 新建 / 编辑待办项目（字段对齐 legacy ProjectForm：名称 ≤ 120 字 + 颜色），tau Dialog 皮。
 * 颜色只提供 7 色设计板（groupColors.ts）；编辑 legacy 色名的项目时按收敛后的色调回显。
 */

import { useEffect, useState } from "react";
import { Button, Dialog, Input, cn, toast } from "@tau/ui";
import type { TodoGroup } from "@/types";
import { TONE_DOT, TONE_OPTIONS, groupTone } from "../groupColors";

export function GroupDialog({
  open,
  group,
  onClose,
  onSubmit,
}: {
  open: boolean;
  /** 编辑态传入；新建为 null */
  group: TodoGroup | null;
  onClose(): void;
  onSubmit(title: string, color: string): Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [color, setColor] = useState<string>(TONE_OPTIONS[4].color);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(group?.title ?? "");
    const tone = group ? groupTone(group.color) : "blue";
    setColor(TONE_OPTIONS.find(o => o.tone === tone)!.color);
  }, [open, group]);

  const save = () => {
    const name = title.trim();
    if (!name) {
      toast.warning("请输入项目名称");
      return;
    }
    setSaving(true);
    onSubmit(name, color)
      .then(onClose)
      .catch(() => toast.error(group ? "保存失败" : "创建项目失败"))
      .finally(() => setSaving(false));
  };

  const activeTone = groupTone(color);

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!next) onClose();
      }}
      title={group ? "编辑项目" : "新建项目"}
      locked={saving}
      width={420}
      footer={
        <>
          <Button variant="secondary" size="sm" disabled={saving} onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" size="sm" loading={saving} onClick={save}>
            {group ? "保存" : "创建"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <label className="flex flex-col gap-1.5">
          <span className="text-ink-2 text-[12px]">名称</span>
          <Input
            data-autofocus
            value={title}
            maxLength={120}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) save();
            }}
            placeholder="例如：编辑器重构"
          />
        </label>
        <div className="flex flex-col gap-1.5">
          <span className="text-ink-2 text-[12px]">颜色</span>
          <div role="radiogroup" aria-label="项目颜色" className="flex gap-2">
            {TONE_OPTIONS.map(option => (
              <button
                key={option.tone}
                type="button"
                role="radio"
                aria-checked={activeTone === option.tone}
                aria-label={option.label}
                title={option.label}
                onClick={() => setColor(option.color)}
                className={cn(
                  "relative size-[22px] rounded-[7px] outline-none focus-visible:shadow-[var(--tau-focus-ring)]",
                  TONE_DOT[option.tone],
                  activeTone === option.tone &&
                    "after:border-ink-1 after:absolute after:-inset-[3px] after:rounded-[9px] after:border-[1.5px] after:content-['']"
                )}
              />
            ))}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
