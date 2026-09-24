/**
 * 预设编辑 Popover：名称 / 计时方式（倒计时 · 正计时）/ 时长（步进 + 快捷档）。
 * 新建与编辑同一形态；触发器模式（工具栏「新建预设」）与锚点模式（chip 右键「编辑」）都支持。
 */

import { useEffect, useState, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { ArrowUp, Hourglass, Minus, Pencil, Plus } from "lucide-react";
import { Button, IconButton, Input, NumberInput, Popover, Segmented, cn, toast } from "@tau/ui";
import type { PomodoroMode, PomodoroPreset } from "@/types";
import type { PresetDraft } from "../queries";

const QUICK_MINUTES = [10, 15, 25, 30, 45, 50, 60, 90];
const MAX_MINUTES = 600;

const draftOf = (preset: PomodoroPreset | null): PresetDraft => ({
  name: preset?.name ?? "",
  mode: preset?.mode ?? "countdown",
  durationMin: preset && preset.mode === "countdown" ? preset.durationMin : 25,
});

export function PresetEditorPopover({
  preset,
  trigger,
  anchor,
  open,
  onOpenChange,
  placement = "bottom-end",
  onSubmit,
}: {
  /** null = 新建 */
  preset: PomodoroPreset | null;
  trigger?: ReactElement;
  anchor?: HTMLElement | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  placement?: ComponentProps<typeof Popover>["placement"];
  onSubmit: (draft: PresetDraft) => Promise<unknown>;
}) {
  const [draft, setDraft] = useState(() => draftOf(preset));
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(draftOf(preset));
      setNameError(false);
    }
  }, [open, preset]);

  const durationValid =
    draft.mode === "countup" || (draft.durationMin >= 1 && draft.durationMin <= MAX_MINUTES);

  const submit = async () => {
    const name = draft.name.trim();
    if (!name) return setNameError(true);
    if (!durationValid || saving) return;
    setSaving(true);
    try {
      await onSubmit({ ...draft, name });
      onOpenChange(false);
    } catch {
      toast.error(preset ? "保存失败" : "创建失败");
    } finally {
      setSaving(false);
    }
  };

  const setDuration = (value: number) =>
    setDraft(d => ({ ...d, durationMin: Math.min(MAX_MINUTES, Math.max(1, value)) }));

  return (
    <Popover
      trigger={trigger}
      anchor={anchor}
      open={open}
      onOpenChange={onOpenChange}
      placement={placement}
      arrow={false}
      className="w-[320px]"
    >
      <Popover.Header
        icon={
          preset ? (
            <Pencil className="size-[15px]" strokeWidth={1.75} />
          ) : (
            <Plus className="size-[15px]" strokeWidth={1.75} />
          )
        }
      >
        {preset ? "编辑预设" : "新建预设"}
      </Popover.Header>
      <Popover.Body>
        <form
          className="flex flex-col gap-3.5"
          onSubmit={e => {
            e.preventDefault();
            void submit();
          }}
        >
          <Field label="名称">
            <Input
              data-autofocus
              size="sm"
              value={draft.name}
              placeholder="如：具体数学"
              aria-invalid={nameError || undefined}
              onChange={e => {
                setNameError(false);
                setDraft(d => ({ ...d, name: e.target.value }));
              }}
            />
          </Field>
          <Field label="计时方式">
            <Segmented
              label="计时方式"
              value={draft.mode}
              onValueChange={(mode: PomodoroMode) => setDraft(d => ({ ...d, mode }))}
            >
              <Segmented.Item value="countdown" icon={Hourglass} label="倒计时" />
              <Segmented.Item value="countup" icon={ArrowUp} label="正计时" />
            </Segmented>
          </Field>
          {draft.mode === "countdown" ? (
            <Field label="时长">
              <div className="flex items-center gap-1.5">
                <IconButton
                  aria-label="减少 5 分钟"
                  className="size-7"
                  onClick={() => setDuration(draft.durationMin - 5)}
                >
                  <Minus className="size-[15px]" strokeWidth={1.75} />
                </IconButton>
                <NumberInput
                  size="sm"
                  className="w-16 text-center tabular-nums"
                  value={draft.durationMin}
                  onValueChange={value => setDraft(d => ({ ...d, durationMin: value ?? 0 }))}
                  aria-label="时长（分钟）"
                  aria-invalid={!durationValid || undefined}
                />
                <span className="text-ink-2 text-tau-meta">分钟</span>
                <IconButton
                  aria-label="增加 5 分钟"
                  className="size-7"
                  onClick={() => setDuration(draft.durationMin + 5)}
                >
                  <Plus className="size-[15px]" strokeWidth={1.75} />
                </IconButton>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {QUICK_MINUTES.map(minutes => (
                  <button
                    key={minutes}
                    type="button"
                    onClick={() => setDuration(minutes)}
                    className={cn(
                      "text-tau-sm h-6 rounded-[7px] px-2 tabular-nums transition-colors duration-150",
                      draft.durationMin === minutes
                        ? "bg-accent-soft text-accent-text font-medium"
                        : "bg-hover text-ink-2 hover:bg-press hover:text-ink-1"
                    )}
                  >
                    {minutes}
                  </button>
                ))}
              </div>
            </Field>
          ) : (
            <p className="text-ink-2 text-tau-meta">
              正计时没有终点，手动结束；不足 5 分钟不会留下记录。
            </p>
          )}
          <button type="submit" hidden />
        </form>
      </Popover.Body>
      <Popover.Footer>
        <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
          取消
        </Button>
        <Button
          variant="primary"
          size="sm"
          loading={saving}
          disabled={!durationValid}
          onClick={() => void submit()}
        >
          {preset ? "保存" : "创建"}
        </Button>
      </Popover.Footer>
    </Popover>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-ink-2 text-tau-sm mb-1.5 font-medium">{label}</div>
      {children}
    </div>
  );
}
