/**
 * 第一次进入创作模式时的意图卡：说说想写什么、从哪些类型里找；也可以跳过、空白白板开始。
 * 白板右上角的意图按钮：点开看 / 改这一句（不在正文里常驻）。
 */

import { useState } from "react";
import { Pencil, Sparkles } from "lucide-react";
import { Button, Popover, Textarea, cn } from "@tau/ui";
import { useOverlayDismiss } from "@/page/PageProvider";
import type { EntityRefKind } from "@/entity/ref";

import { useComposeUiI18n } from "../ui.i18n";

const KIND_OPTIONS = [
  "card",
  "article",
  "project-item",
  "diary-moment",
] as const satisfies readonly EntityRefKind[];

export function IntentCard({
  initialIntent,
  canGather,
  busy,
  onStart,
  onSkip,
}: {
  initialIntent: string;
  /** 配了「AI 洞见」模型才能自动找资料 */
  canGather: boolean;
  busy: boolean;
  onStart(intent: string, kinds: EntityRefKind[]): void;
  onSkip(): void;
}) {
  const { t } = useComposeUiI18n();
  const [intent, setIntent] = useState(initialIntent);
  const [kinds, setKinds] = useState<EntityRefKind[]>([...KIND_OPTIONS]);
  useOverlayDismiss(onSkip, !busy);
  const start = () => {
    if (!intent.trim() || !kinds.length || busy) return;
    onStart(intent.trim(), kinds);
  };

  return (
    <div className="bg-overlay absolute inset-0 z-20 grid place-items-center p-6">
      <div className="bg-surface shadow-float rounded-tau-lg w-full max-w-[520px] px-[22px] pt-5 pb-4">
        <h3 className="text-ink-1 text-[16px] font-semibold">{t("ui.intent.title")}</h3>
        <p className="text-ink-3 text-tau-meta mt-1 mb-3.5">
          {canGather ? t("ui.intent.gatherHint") : t("ui.intent.noModelHint")}
        </p>
        <Textarea
          autoFocus
          rows={4}
          value={intent}
          placeholder={t("ui.intent.example")}
          onChange={event => setIntent(event.target.value)}
          onKeyDown={event => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              if (canGather) start();
            }
          }}
        />
        {canGather && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {KIND_OPTIONS.map(kind => {
              const on = kinds.includes(kind);
              return (
                <button
                  key={kind}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setKinds(current =>
                      on ? current.filter(value => value !== kind) : [...current, kind]
                    )
                  }
                  className={cn(
                    "text-tau-meta inline-flex h-[26px] items-center rounded-full border px-2.5 transition-colors",
                    on
                      ? "bg-accent-soft text-accent-text border-transparent"
                      : "border-line-1 text-ink-2 hover:bg-hover"
                  )}
                >
                  {t(`ui.kind.${kind}`)}
                </button>
              );
            })}
          </div>
        )}
        <div className="mt-4 flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onSkip} disabled={busy}>
            {canGather ? t("ui.intent.skip") : t("ui.intent.blank")}
          </Button>
          <div className="flex-1" />
          {canGather ? (
            <Button
              variant="primary"
              icon={Sparkles}
              onClick={start}
              loading={busy}
              disabled={!intent.trim() || !kinds.length}
            >
              {t("ui.intent.gather")}
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={() => onStart(intent.trim(), [])}
              loading={busy}
              disabled={!intent.trim()}
            >
              {t("ui.intent.start")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** 白板右上角的意图入口：看 / 改写作意图（改了只影响以后的「再找一些」） */
export function IntentButton({
  intent,
  onChange,
}: {
  intent: string;
  onChange(intent: string): void;
}) {
  const { t } = useComposeUiI18n();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(intent);
  const save = () => {
    setOpen(false);
    if (draft.trim() !== intent) onChange(draft.trim());
  };
  return (
    <Popover
      open={open}
      onOpenChange={next => {
        if (next) setDraft(intent);
        setOpen(next);
      }}
      placement="bottom-end"
      arrow={false}
      className="w-[340px]"
      trigger={
        <button
          type="button"
          title={t("ui.intent.entry")}
          aria-label={t("ui.intent.entry")}
          className={cn(
            "bg-surface shadow-card text-ink-2 hover:text-ink-1 hover:bg-surface-hover grid size-[30px] place-items-center rounded-full",
            open && "text-ink-1"
          )}
        >
          <Pencil className="size-3.5" strokeWidth={1.75} />
        </button>
      }
    >
      <div className="p-3">
        <p className="text-ink-3 text-tau-meta mb-2">{t("ui.intent.editHint")}</p>
        <Textarea
          autoFocus
          rows={4}
          value={draft}
          placeholder={t("ui.intent.placeholder")}
          onChange={event => setDraft(event.target.value)}
          onKeyDown={event => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              save();
            }
          }}
        />
        <div className="mt-2.5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            {t("ui.cancel")}
          </Button>
          <Button variant="primary" size="sm" onClick={save}>
            {t("ui.save")}
          </Button>
        </div>
      </div>
    </Popover>
  );
}
