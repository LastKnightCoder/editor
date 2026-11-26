import { useGroupDialogI18n } from "./GroupDialog.i18n";
/**
 * 新建 / 编辑分组（默认称为待办项目；名称 ≤ 120 字 + 颜色），tau Dialog 皮。
 * 颜色只提供 7 色设计板（utils/groupTone.ts）；编辑 legacy 色名的分组时按收敛后的色调回显。
 */

import { useEffect, useState } from "react";
import { Button, Dialog, DialogBody, Input, cn, toast } from "@tau/ui";
import { TONE_DOT, TONE_OPTIONS, groupTone } from "@/utils/groupTone";

export function GroupDialog({
  open,
  group,
  noun,
  placeholder,
  onClose,
  onSubmit,
}: {
  open: boolean;
  /** 编辑态传入；新建为 null */
  group: { id: number; title: string; color?: string | null } | null;
  /** 分组的称呼，默认「项目」 */
  noun?: string;
  placeholder?: string;
  onClose(): void;
  onSubmit(title: string, color: string): Promise<void>;
}) {
  const { t } = useGroupDialogI18n();
  const groupNoun = noun ?? t("noun");
  const groupId = group?.id;
  const initialTitle = group?.title;
  const initialColor = group?.color;
  const editing = group !== null;
  const [title, setTitle] = useState("");
  const [color, setColor] = useState<string>(TONE_OPTIONS[4].color);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(initialTitle ?? "");
    const tone = editing ? groupTone(initialColor) : "blue";
    const option = TONE_OPTIONS.find(o => o.tone === tone);
    setColor(option ? option.color : TONE_OPTIONS[4].color);
  }, [open, groupId, initialTitle, initialColor, editing]);

  const save = () => {
    const name = title.trim();
    if (!name) {
      toast.warning(t("enterName", { noun: groupNoun }));
      return;
    }
    setSaving(true);
    onSubmit(name, color)
      .then(onClose)
      .catch(() => toast.error(group ? t("saveFailed") : t("createFailed", { noun: groupNoun })))
      .finally(() => setSaving(false));
  };

  const activeTone = groupTone(color);

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!next) onClose();
      }}
      title={t(group ? "edit" : "new", { noun: groupNoun })}
      locked={saving}
      width={420}
      footer={
        <>
          <Button variant="secondary" size="sm" disabled={saving} onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button variant="primary" size="sm" loading={saving} onClick={save}>
            {t(group ? "save" : "create")}
          </Button>
        </>
      }
    >
      <DialogBody>
        <div className="flex flex-col gap-3.5">
          <label className="flex flex-col gap-1.5">
            <span className="text-ink-2 text-[12px]">{t("name")}</span>
            <Input
              data-autofocus
              value={title}
              maxLength={120}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) save();
              }}
              placeholder={placeholder ?? t("placeholder")}
            />
          </label>
          <div className="flex flex-col gap-1.5">
            <span className="text-ink-2 text-[12px]">{t("color")}</span>
            <div
              role="radiogroup"
              aria-label={t("groupColor", { noun: groupNoun })}
              className="flex gap-2"
            >
              {TONE_OPTIONS.map(option => (
                <button
                  key={option.tone}
                  type="button"
                  role="radio"
                  aria-checked={activeTone === option.tone}
                  aria-label={t(`tone.${option.tone}`)}
                  title={t(`tone.${option.tone}`)}
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
      </DialogBody>
    </Dialog>
  );
}
